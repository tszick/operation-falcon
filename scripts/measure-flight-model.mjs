import { serviceProbe } from './ai-service-playtest.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { aircraft, experimentalAircraft } from '../src/aircraftSpec.js';
import { createAircraft, stepAircraft } from '../src/physics.js';
import { atmosphere, mass } from '../src/performance.js';
import { configureTerrain } from '../src/terrain.js';
import { Vec3, Quat, attitude } from '../src/math.js';
import { FlightRecorder } from '../src/flightRecorder.js';
import { Weapons } from '../src/weapons.js';

function flight(id = 'f16', height = 6000, speed = 200) {
  const s = createAircraft(aircraft.find((a) => a.id === id));
  Object.assign(s, {
    position: new Vec3(0, height, 0),
    previousPosition: new Vec3(0, height, 0),
    velocity: new Vec3(0, 0, speed),
    orientation: Quat.euler(0, 0.04, 0),
    onGround: false,
    airborne: true,
    gear: false,
    flaps: false,
    flapPosition: 0,
    throttle: 0.65,
    fuel: s.spec.fuelCapacity * 0.4,
  });
  s.ammo = { gun: 0, aam: 0, agm: 0, bomb: 0 };
  if (id === 'b52') {
    const air = atmosphere(height),
      q = 0.5 * air.density * speed * speed;
    const alpha =
      ((mass(s) * 9.81) / (q * s.spec.wingArea) - (s.spec.liftZero ?? 0.22)) / s.spec.clSlope;
    s.orientation = Quat.euler(0, alpha, 0);
  }
  s.condition.seed = 771;
  s.weather = { wind: { x: 0, y: 0, z: 0 }, gust: 0, turbulence: 0, seed: 17 };
  return s;
}
export function runFlightMeasurements(directory, phase = 'current') {
  fs.mkdirSync(directory, { recursive: true });
  configureTerrain(
    { id: 'measurement', weather: { wind: { x: 0, y: 0, z: 0 }, gust: 0, turbulence: 0 } },
    new Vec3(22000, 0, 0),
    () => 0.3,
  );
  const report = { phase, physicsHz: 120, scenarios: {} };
  function record(name, s, seconds, control = () => ({}), stop = () => false) {
    const recorder = new FlightRecorder({ now: () => '2026-10-25T00:00:00Z' }),
      m = {
        spec: { id: 'flight-model-measurement', name },
        phaseId: 'measurement',
        phase: 'MÉRÉS',
        phaseHint: '',
        objectives: [],
      },
      w = new Weapons({ enemyFire: false }),
      aim = { id: null, locked: false, progress: 0 };
    recorder.start(s, m, [], w, aim);
    for (let i = 0; i < Math.round(seconds * 120) && !s.crashed; i++) {
      const input = control(i / 120, s);
      stepAircraft(s, input);
      recorder.capture(s, m, [], w, aim, input);
      if (stop(s)) break;
    }
    recorder.capture(s, m, [], w, aim, {}, true);
    recorder.finish({ result: s.crashed ? 'crash' : 'measurement', score: 0 });
    const log = recorder.export();
    fs.writeFileSync(path.join(directory, phase + '-' + name + '.json'), JSON.stringify(log));
    const samples = log.entries.filter((e) => e.kind === 'sample').map((e) => e.data.player);
    const last = samples.at(-1);
    const result = {
      duration: log.metadata.durationSeconds,
      crashed: last.crashed,
      damage: last.damage,
      finalPosition: last.position,
      samples: samples.length,
    };
    report.scenarios[name] = result;
    return { s, log, samples, result, last };
  }
  for (const hot of [false, true]) {
    const s = flight();
    s.throttle = hot ? 0.7 : 0;
    s.engineSpool = s.throttle;
    stepAircraft(s, {});
    s.throttle = 1;
    const x = record(hot ? 'engine-hot' : 'engine-cold', s, 8);
    x.result.thrustAtSeconds = [0.1, 1, 2, 4, 8].map((t) => {
      const p = x.log.entries.find((e) => e.kind === 'sample' && e.t >= t)?.data.player;
      return {
        t,
        thrustN: p?.forces?.thrustN,
        deliveredFraction: p?.forces?.targetThrustN
          ? p.forces.thrustN / p.forces.targetThrustN
          : null,
        spool: p?.engineSpool ?? null,
      };
    });
  }
  for (const id of ['f16', 'b52']) {
    const x = record('roll-' + id, flight(id), 3, (t) => ({ roll: t < 0.8 ? 0.5 : 0 }));
    const first = x.log.entries.find((e) => e.kind === 'sample' && e.t >= 0.8)?.data.player;
    x.result.releaseBankDeg = first?.bankDeg;
    x.result.finalBankDeg = x.last.bankDeg;
  }
  for (const [name, wind] of [
    ['calm', 0],
    ['headwind', -12],
    ['tailwind', 12],
  ]) {
    const s = flight('f16', 1000, 100);
    s.weather.wind.z = wind;
    const x = record('wind-' + name, s, 0.1);
    x.result.iasKmh = x.last.iasKmh;
    x.result.tasMps = x.last.tasKmh / 3.6;
    x.result.groundMps = x.last.groundSpeedKmh / 3.6;
  }
  for (const height of [5, 100]) {
    const s = flight('f16', height, 100 / Math.sqrt(atmosphere(height).density / 1.225));
    s.orientation = Quat.euler(0, 0.1, 0);
    const x = record('ground-' + height, s, 1 / 120);
    x.result.dragN = x.last.forces.dragN;
    x.result.liftN = x.last.forces.liftN;
    x.result.groundEffect = x.last.forces.groundEffectFactor ?? null;
  }
  for (const mach of [0.6, 0.85, 1, 1.2, 2]) {
    const s = flight('f16', 10000, mach * atmosphere(10000).soundSpeed);
    s.orientation = new Quat();
    const x = record('mach-' + mach, s, 1 / 120);
    x.result.cd =
      x.last.forces.dragN / (x.last.forces.dynamicPressurePa * x.log.metadata.aircraft.wingArea);
    x.result.waveCd = x.last.forces.waveDragCoefficient ?? null;
  }
  for (const spec of [
    ...experimentalAircraft,
    ...aircraft.filter((a) => ['f16', 'b52'].includes(a.id)),
  ]) {
    const s = createAircraft(spec);
    s.fuel *= spec.id === 'b52' ? 0.95 : 1;
    s.throttle = 1;
    s.afterburner = !!spec.hasAB;
    let liftedAt = null,
      liftoffDistanceM = null;
    const x = record(
      'takeoff-' + spec.id,
      s,
      90,
      () => ({
        pitch:
          s.ias > 65 && attitude(s.orientation).pitch < (spec.id === 'b52' ? 0.07 : 0.14) ? 0.5 : 0,
      }),
      (state) => {
        if (state.airborne && liftedAt === null) {
          liftedAt = state.elapsed;
          liftoffDistanceM = state.position.z + 1320;
        }
        return liftedAt !== null && state.elapsed > liftedAt + 10;
      },
    );
    x.result.liftoffAt = liftedAt;
    x.result.liftoffDistanceM = liftoffDistanceM;
    x.result.finalAglM = x.last.aglM;
    x.result.finalClimbMps = x.last.verticalSpeedMps;
  }
  const ai = serviceProbe({
    side: 'enemy',
    weather: { wind: { x: 5, y: 0, z: -2 }, gust: 0.3, turbulence: 0.1, shear: 0, seed: 17 },
  });
  fs.writeFileSync(
    path.join(directory, phase + '-ai-crosswind-service.json'),
    JSON.stringify(ai, null, 2),
  );
  fs.writeFileSync(
    path.join(directory, phase + '-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2])
    throw Error('Usage: node scripts/measure-flight-model.mjs OUTPUT_DIRECTORY [PHASE]');
  console.log(
    JSON.stringify(runFlightMeasurements(process.argv[2], process.argv[3] || 'current'), null, 2),
  );
}
