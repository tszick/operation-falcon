import { trainingAircraft, isPracticeMission, unarmedPractice } from '../src/trainingAircraft.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft, experimentalAircraft, missions } from '../src/aircraftSpec.js';
import { defaultLoadout, configureAircraft, plannedDeparture } from '../src/loadoutPlanner.js';
import { mass, massBreakdown, approachSpeeds } from '../src/performance.js';
import { createMissionAircraft, defaultMissionFuel } from '../src/missionStart.js';
import { stepAircraft } from '../src/physics.js';
import { consumeFuel } from '../src/fuel.js';
import { Weapons } from '../src/weapons.js';
import { Mission } from '../src/mission.js';
import { Targeting } from '../src/targeting.js';
import { FlightRecorder } from '../src/flightRecorder.js';
const f16 = aircraft.find((a) => a.id === 'f16'),
  close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
test('F16 planner accounts separately for empty aircraft, fuel, stores and complete gun rounds', () => {
  const choice = defaultLoadout(f16),
    full = plannedDeparture(f16, choice);
  close(full.emptyKg, 8570);
  close(full.fuelKg, 3200);
  close(full.gunAmmoKg, 112.42);
  close(full.missilesKg, 608);
  close(full.bombsKg, 482);
  close(full.totalKg, 12972.42);
  choice.stations[0] = choice.stations[1] = '';
  choice.gun = false;
  const lighter = plannedDeparture(f16, choice, { fuelFraction: 0.5 });
  close(lighter.totalKg, 11088);
  close(full.totalKg - lighter.totalKg, 1884.42);
  assert.equal(lighter.gunAmmoKg, 0);
});
test('planner and actual mission-start mass match for every aircraft, fuel level and start mode', () => {
  for (const a of aircraft)
    for (const id of ['civil', 'landing', 'escort-transport'])
      for (const fuelFraction of [0, 0.05, 0.15, 0.5, 1]) {
        const m = missions.find((m) => m.id === id),
          base = isPracticeMission(m) ? trainingAircraft : a,
          choice = defaultLoadout(base);
        if (!isPracticeMission(m)) {
          choice.gun = false;
          choice.stations[0] = '';
        }
        const spec = configureAircraft(base, choice),
          plan = plannedDeparture(base, choice, { fuelFraction, unarmed: unarmedPractice(m) }),
          s = createMissionAircraft(spec, m, { fuelFraction });
        close(s.fuel, plan.fuelKg);
        close(mass(s), plan.totalKg);
        assert.deepEqual(s.ammo, plan.ammo);
        assert.equal(s.enginePower, fuelFraction > 0 ? 1 : 0);
        assert.ok(Number.isFinite(s.orientation.w));
      }
});
test('default tanking stays full for ordinary missions and fifteen percent for landing practice; explicit values override it', () => {
  for (const m of missions) {
    const a =
      m.objective === 'flight-test'
        ? experimentalAircraft.find((a) => a.faction === m.side)
        : m.naval
          ? aircraft.find((a) => a.id === 'fa18')
          : f16;
    const actual = isPracticeMission(m) ? trainingAircraft : a;
    const expected = m.objective === 'landing' ? 0.15 : m.objective === 'canyon' ? 0.5 : 1;
    assert.equal(defaultMissionFuel(m), expected);
    close(createMissionAircraft(a, m).fuel, actual.fuelCapacity * expected);
    close(createMissionAircraft(a, m, { fuelFraction: 0.42 }).fuel, actual.fuelCapacity * 0.42);
  }
  const m = missions.find((m) => m.id === 'civil');
  close(createMissionAircraft(f16, m, { fuelFraction: 5 }).fuel, trainingAircraft.fuelCapacity);
  close(createMissionAircraft(f16, m, { fuelFraction: -2 }).fuel, 0);
  close(createMissionAircraft(f16, m, { fuelFraction: NaN }).fuel, trainingAircraft.fuelCapacity);
});

test('fuel consumption, an actual cannon shot and releasing stores reduce the same flying mass used in the planner', () => {
  const choice = defaultLoadout(f16),
    s = createMissionAircraft(
      configureAircraft(f16, choice),
      missions.find((m) => m.id === 'convoy'),
      { fuelFraction: 0.5 },
    ),
    before = mass(s);
  consumeFuel(s, 2, 5);
  close(before - mass(s), 10);
  const w = new Weapons();
  w.selected = 'gun';
  assert.equal(w.fire(s, [], { id: null, locked: false }), 'ÁGYÚTŰZ');
  close(before - mass(s), 10.22);
  s.ammo.bomb--;
  close(before - mass(s), 251.22);
  close(massBreakdown(s).totalKg, mass(s));
});
test('lower chosen fuel mass changes acceleration and the lift-limited approach speed', () => {
  const m = missions.find((m) => m.id === 'civil'),
    heavy = createMissionAircraft(m.naval ? aircraft.find((a) => a.id === 'fa18') : f16, m),
    light = createMissionAircraft(f16, m, { fuelFraction: 0.2 });
  heavy.throttle = light.throttle = 1;
  for (let i = 0; i < 120; i++) {
    stepAircraft(heavy, {});
    stepAircraft(light, {});
  }
  assert.ok(light.speed > heavy.speed);
  const a = aircraft.find((a) => a.id === 'mig31'),
    h = createMissionAircraft(a, m),
    l = createMissionAircraft(a, m, { fuelFraction: 0.15 });
  assert.ok(approachSpeeds(h).target > approachSpeeds(l).target);
});
test('flight-log metadata retains selected departure fuel and mass even after flight consumption', () => {
  const m = missions.find((m) => m.id === 'escort-transport'),
    s = createMissionAircraft(f16, m, { fuelFraction: 0.37 }),
    rec = new FlightRecorder(),
    w = new Weapons(),
    mission = new Mission(m),
    aim = new Targeting(),
    initial = mass(s);
  rec.start(s, mission, [], w, aim);
  consumeFuel(s, 10, 1);
  rec.capture(s, mission, [], w, aim, {}, true);
  const log = rec.export();
  close(log.metadata.departure.fuelFraction, 0.37);
  close(log.metadata.departure.fuelKg, 1184);
  close(log.metadata.departure.mass.totalKg, initial);
  close(
    log.entries.filter((e) => e.kind === 'sample').at(-1).data.player.massKg,
    Math.round((initial - 10) * 10000) / 10000,
  );
});
