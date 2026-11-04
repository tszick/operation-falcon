import { steerCoordinatedFlight } from '../src/formationAI.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft, experimentalAircraft } from '../src/aircraftSpec.js';
import { aiAircraft } from '../src/heavyAircraftData.js';
import { trainingAircraft } from '../src/trainingAircraft.js';
import { altitudeProfile, altitudePerformance, thrustFactor } from '../src/flightModel.js';
import { atmosphere } from '../src/performance.js';
import { createAircraft, stepAircraft } from '../src/physics.js';
import { Vec3, Quat } from '../src/math.js';
const roster = [
  ...new Map(
    [...aircraft, ...experimentalAircraft, ...aiAircraft, trainingAircraft].map((s) => [s.id, s]),
  ).values(),
];

test('all aircraft reach their reference service ceiling with diminishing, continuous climb capability', () => {
  for (const spec of roster) {
    const p = altitudeProfile(spec);
    const at = altitudePerformance(spec, spec.ceiling, p.referenceMassKg);
    const below = altitudePerformance(spec, spec.ceiling - 1000, p.referenceMassKg);
    const above = altitudePerformance(spec, spec.ceiling + 1000, p.referenceMassKg);
    assert.ok(Math.abs(at.maxClimbMps - 0.508) < 0.001, spec.id);
    assert.ok(below.maxClimbMps > at.maxClimbMps, spec.id);
    assert.ok(above.maxClimbMps === null || above.maxClimbMps < 0, spec.id);
    const h = spec.ceiling * 0.55;
    assert.ok(
      Math.abs(
        thrustFactor(spec, atmosphere(h - 0.01), 0.6) -
          thrustFactor(spec, atmosphere(h + 0.01), 0.6),
      ) < 0.00001,
    );
  }
});

test('mass, stores and engine or wing damage lower attainable altitude without moving an artificial ceiling', () => {
  for (const id of ['f16', 'b52', 'c130', 't45']) {
    const s = roster.find((a) => a.id === id),
      m = altitudeProfile(s).referenceMassKg,
      h = s.ceiling;
    const clean = altitudePerformance(s, h, m);
    const loaded = altitudePerformance(s, h, m * 1.25, { drag: 0.008 });
    const engineOut = altitudePerformance(s, h, m, { engine: 0.5 });
    const wingDamage = altitudePerformance(s, h, m, { lift: 0.7, drag: 0.025 });
    assert.ok(loaded.maxClimbMps < clean.maxClimbMps, id);
    assert.equal(loaded.canSustain, false, id);
    assert.equal(engineOut.canSustain, false, id);
    assert.equal(wingDamage.canSustain, false, id);
    assert.ok(altitudePerformance(s, h, m * 0.75).maxClimbMps > clean.maxClimbMps, id);
  }
});

test('lower atmosphere retains existing thrust and extreme altitude has no artificial thrust floor', () => {
  for (const s of roster) {
    const a = atmosphere(2000),
      mach = 0.5;
    const old = (a.density / 1.225) ** 0.75 * (1 - (mach / s.maxMach) * 0.22);
    assert.ok(Math.abs(thrustFactor(s, a, mach) - old) < 1e-12, s.id);
    const upper = thrustFactor(s, atmosphere(50000), mach);
    assert.ok(
      Number.isFinite(upper) && upper >= 0 && upper < thrustFactor(s, atmosphere(s.ceiling), mach),
      s.id,
    );
  }
});

test('real player physics loses energy above ceiling instead of clamping altitude or destroying the aircraft', () => {
  for (const id of ['f16', 'b52', 't45']) {
    const spec = roster.find((a) => a.id === id),
      h = spec.ceiling + 1500;
    const state = createAircraft(spec, { ammo: {} });
    state.fuel = spec.fuelCapacity * 0.5;
    const mass = altitudeProfile(spec).referenceMassKg;
    const perf = altitudePerformance(spec, h, mass),
      v = perf.bestSpeedMps;
    assert.ok(v > 0, id);
    const air = atmosphere(h),
      q = 0.5 * air.density * v * v;
    const thrust =
      (spec.hasAB ? spec.abThrust : spec.thrust) * thrustFactor(spec, air, v / air.soundSpeed);
    let cl = (mass * 9.81) / (q * spec.wingArea),
      alpha = 0;
    for (let k = 0; k < 12; k++) {
      alpha = (cl - (spec.liftZero ?? 0.22)) / spec.clSlope;
      cl = (mass * 9.81 - thrust * Math.sin(alpha)) / (q * spec.wingArea);
    }
    Object.assign(state, {
      position: new Vec3(0, h, 0),
      velocity: new Vec3(0, 0, v),
      orientation: Quat.euler(0, alpha, 0),
      gear: false,
      flaps: false,
      flapPosition: 0,
      onGround: false,
      airborne: true,
      throttle: 1,
      engineSpool: 1,
      afterburner: !!spec.hasAB,
      afterburnerSpool: spec.hasAB ? 1 : 0,
    });
    const before = (v * v) / 2 + 9.81 * h;
    stepAircraft(state, {});
    const after = state.velocity.length() ** 2 / 2 + 9.81 * state.position.y;
    assert.ok(after < before, id + ': energy must decrease');
    assert.equal(state.crashed, false);
    assert.ok(state.position.y > spec.ceiling);
    assert.ok(state.forces.maximumSustainedClimbMps < 0);
  }
});

test('friendly and hostile AI cannot create a climb without excess power', () => {
  const spec = roster.find((a) => a.id === 'f16'),
    h = spec.ceiling + 1500,
    m = altitudeProfile(spec).referenceMassKg;
  const v = altitudePerformance(spec, h, m).bestSpeedMps;
  for (const team of ['ally', 'enemy']) {
    const t = {
      aircraftId: 'f16',
      team,
      position: new Vec3(0, h, 0),
      velocity: new Vec3(0, 0, v),
      heading: 0,
      navigationReferenceMass: m,
    };
    const plan = {
      position: new Vec3(0, h + 5000, 10000),
      targetSpeed: v + 30,
      afterburner: true,
      bankLimit: 0.5,
    };
    for (let i = 0; i < 120; i++) steerCoordinatedFlight(t, plan, 1 / 120);
    assert.ok(t.airVelocity.y <= 0, team);
    assert.equal(t.pitch, 0);
  }
});
