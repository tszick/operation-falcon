import test from 'node:test';
import assert from 'node:assert/strict';
import { experimentalAircraft, missions, aircraft } from '../src/aircraftSpec.js';
import { catalogueAircraft } from '../src/aircraftCatalog.js';
import { canChooseSide, missionForSide } from '../src/missionSides.js';
import { createMissionAircraft } from '../src/missionStart.js';
import { createTargets, Targeting } from '../src/targeting.js';
import { aircraftFlightSpec } from '../src/aiAircraftSpec.js';
import { aircraftMesh } from '../src/airframes.js';
import { Mission } from '../src/mission.js';
import { Weapons } from '../src/weapons.js';
import { Vec3, Quat, DEG, attitude } from '../src/math.js';
import { atmosphere, mass } from '../src/performance.js';
import { stepAircraft, createAircraft } from '../src/physics.js';
import {
  defaultLoadout,
  plannedDeparture,
  configureAircraft,
  stationOptions,
} from '../src/loadoutPlanner.js';
import { externalStoreCount } from '../src/armament.js';
import { missileAppearance } from '../src/missileVisuals.js';
const programs = missions.filter((m) => m.objective === 'flight-test');

test('flight-test category has two fixed programmes and three unarmed, distinct post-1971 aircraft per side', () => {
  assert.equal(programs.length, 2);
  assert.equal(experimentalAircraft.length, 6);
  const shapes = new Set();
  for (const mission of programs) {
    assert.equal(canChooseSide(mission), false);
    assert.equal(missionForSide(mission, 'east'), mission);
    const roster = catalogueAircraft(mission);
    assert.equal(roster.length, 3);
    for (const a of roster) {
      assert.equal(a.faction, mission.side);
      assert.ok(a.firstFlight >= 1971);
      assert.equal(aircraftFlightSpec(a.id), a);
      const targets = createTargets(mission, a, { rng: () => 0.3 });
      assert.deepEqual(targets, []);
      const s = createMissionAircraft(a, mission);
      assert.equal(s.spec.id, a.id);
      assert.equal(s.training, true);
      assert.equal(s.onGround, true);
      assert.equal(
        Object.values(s.ammo).reduce((sum, n) => sum + n, 0),
        0,
      );
      assert.ok(mass(s) <= a.maxTakeoffMass);
      const mesh = aircraftMesh(a.id);
      assert.ok(mesh.faces.length > 40);
      assert.ok(mesh.points.every((p) => Number.isFinite(p.x + p.y + p.z)));
      shapes.add(JSON.stringify(mesh.points));
      const q = 0.5 * 1.225 * (a.testProfile.ias / 3.6) ** 2,
        cl = (mass(s) * 9.81) / (q * a.wingArea),
        air = atmosphere(a.testProfile.altitude),
        tas = a.testProfile.ias / 3.6 / Math.sqrt(air.density / 1.225);
      assert.ok(cl < a.maxCL, 'Test point has lift margin: ' + a.id);
      assert.ok(tas < a.maxMach * air.soundSpeed, 'Test point below envelope: ' + a.id);
      const drag = q * a.wingArea * (a.cd0 + a.inducedDrag * cl * cl);
      assert.ok(
        drag < a.thrust * (air.density / 1.225) * (1 - (tas / (a.maxMach * air.soundSpeed)) * 0.22),
        'Test point has thrust margin: ' + a.id,
      );
    }
  }
  assert.equal(shapes.size, 6);
  const a = experimentalAircraft[0];
  assert.throws(() =>
    createMissionAircraft(
      a,
      missions.find((m) => m.id === 'convoy'),
    ),
  );
});
test('test card requires consecutive stable samples, both bank directions and stopped recovery, without refit', () => {
  for (const mission of programs)
    for (const a of catalogueAircraft(mission)) {
      createTargets(mission, a, { rng: () => 0.3 });
      const s = createMissionAircraft(a, mission),
        m = new Mission(mission),
        w = new Weapons(),
        aim = new Targeting();
      m.update(s, [], w, aim);
      s.airborne = true;
      s.onGround = false;
      s.gear = false;
      s.flaps = false;
      s.flapPosition = 0;
      s.agl = a.testProfile.altitude;
      s.position.y = a.testProfile.altitude;
      s.ias = a.testProfile.ias / 3.6;
      s.velocity = new Vec3(0, 0, s.ias);
      const tick = (duration) => {
        for (let i = 0; i < Math.round(duration * 10); i++) {
          s.elapsed += 0.1;
          m.update(s, [], w, aim);
        }
      };
      tick(8);
      assert.ok(m.flightTest.level > 7);
      s.position.y += 500;
      tick(0.1);
      assert.equal(m.flightTest.level, 0);
      s.position.y -= 500;
      tick(12.2);
      assert.equal(m.phaseId, 'test-left');
      s.orientation = Quat.euler(0, 0, -30 * DEG);
      tick(3.2);
      assert.equal(m.phaseId, 'test-right');
      assert.equal(m.complete, false);
      s.orientation = Quat.euler(0, 0, 30 * DEG);
      tick(3.2);
      assert.equal(m.phaseId, 'test-return');
      assert.equal(m.complete, false);
      s.onGround = true;
      s.position.y = 2;
      s.speed = 12;
      s.landing = { success: true };
      tick(0.1);
      assert.equal(m.complete, false);
      s.speed = 0;
      tick(0.1);
      assert.equal(m.complete, true);
      assert.equal(w.missionEnded, true);
      assert.equal(m.serviceCount || 0, 0);
      assert.ok(m.objectives.every((o) => o.done));
    }
});
test('all six prototypes lift off with their default test fuel within the physical runway', () => {
  for (const mission of programs)
    for (const a of catalogueAircraft(mission)) {
      createTargets(mission, a, { rng: () => 0.3 });
      const s = createMissionAircraft(a, mission);
      s.throttle = 1;
      s.afterburner = true;
      for (let i = 0; i < 120 * 70 && !s.airborne && !s.crashed; i++)
        stepAircraft(s, { pitch: s.speed > 65 && attitude(s.orientation).pitch < 8 * DEG ? 1 : 0 });
      assert.equal(s.airborne, true, a.id + ' takeoff');
      assert.ok(s.position.z < 1600, a.id + ' runway length');
      assert.equal(s.damage, 0, a.id + ' takeoff damage');
    }
});
test('B-52 max fuel plus stores is flagged overweight; permitted loaded takeoff uses low body attitude and internal stores add no drag', () => {
  const a = aircraft.find((a) => a.id === 'b52'),
    choice = defaultLoadout(a);
  assert.equal(plannedDeparture(a, choice).withinLimits, false);
  const plan = plannedDeparture(a, choice, { fuelFraction: 0.95 });
  assert.equal(plan.withinLimits, true);
  assert.ok(plan.maxFuelFraction < 1);
  createTargets(programs[0], experimentalAircraft[0], { rng: () => 0.3 });
  const s = createAircraft(a);
  s.fuel *= 0.95;
  s.throttle = 1;
  assert.equal(externalStoreCount(s), 0);
  for (let i = 0; i < 120 * 65 && !s.airborne && !s.crashed; i++)
    stepAircraft(s, { pitch: s.speed > 65 && attitude(s.orientation).pitch < 4 * DEG ? 0.3 : 0 });
  assert.equal(s.airborne, true);
  assert.ok(s.position.z < 1600);
  assert.equal(s.damage, 0);
  const fighter = createAircraft(aircraft.find((a) => a.id === 'f16'));
  assert.ok(externalStoreCount(fighter) > 0);
  fighter.ammo.aam = fighter.ammo.agm = fighter.ammo.bomb = 0;
  assert.equal(externalStoreCount(fighter), 0);
});
test('missile flame remains finite near the camera, fades continuously and cannot re-light after burnout', () => {
  const r = {
    focal: 720,
    project(p) {
      return p.z > 1
        ? { x: 800 + (p.x * 720) / p.z, y: 450 - (p.y * 720) / p.z, depth: p.z }
        : null;
    },
  };
  const p = {
    position: new Vec3(0.1, 0.2, 2.1),
    velocity: new Vec3(500, 0, 800),
    profile: { burn: 4 },
    age: 3.5,
  };
  let previous = 1;
  for (let i = 0; i < 150; i++) {
    p.age = 3.5 + i / 120;
    const v = missileAppearance(r, p);
    assert.ok(v.flame <= previous);
    previous = v.flame;
    assert.ok(v.flamePixels <= 24);
    assert.ok(v.bodyPixels <= 12);
    assert.ok(Number.isFinite(v.axis.x + v.axis.y));
    if (p.age >= 4) assert.equal(v.flame, 0);
  }
  p.position.z = -1;
  assert.equal(missileAppearance(r, p), null);
  p.position.z = 10;
  p.age = 0;
  p.profile.burn = 0;
  assert.equal(missileAppearance(r, p).flame, 0);
});

test('stores drag is shared across every model and follows internal/external placement and releases', () => {
  for (const base of aircraft) {
    const choice = defaultLoadout(base);
    choice.stations = choice.stations.map((type, i) =>
      stationOptions(base, i).includes('bomb') ? 'bomb' : type,
    );
    const a = configureAircraft(base, choice);
    const full = createAircraft(a),
      empty = createAircraft(a);
    for (const s of [full, empty]) {
      s.onGround = false;
      s.airborne = true;
      s.position = new Vec3(0, 2000, 0);
      s.velocity = new Vec3(0, 0, 140);
      s.flaps = false;
      s.flapPosition = 0;
      s.gear = false;
    }
    empty.ammo.aam = empty.ammo.agm = empty.ammo.bomb = 0;
    const hasExternal = externalStoreCount(full) > 0;
    stepAircraft(full, {});
    stepAircraft(empty, {});
    if (hasExternal)
      assert.ok(full.forces.dragN > empty.forces.dragN, a.id + ' external stores add drag');
    else
      assert.equal(
        full.forces.dragN,
        empty.forces.dragN,
        a.id + ' internal stores add no external drag',
      );
    full.ammo.aam = full.ammo.agm = full.ammo.bomb = 0;
    assert.equal(externalStoreCount(full), 0, a.id + ' release invalidates cached load');
  }
});
