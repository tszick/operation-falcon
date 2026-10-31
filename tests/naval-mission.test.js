import { stepAircraft } from '../src/physics.js';
import { attitude } from '../src/math.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { navalScenario, advanceNaval } from './navalScenarios.js';
import { Vec3, Quat } from '../src/math.js';
import { terrainWorld } from '../src/terrain.js';
import { missionSurface } from '../src/surfaceStyle.js';
import { missions, aircraft, missionAircraftChoices } from '../src/aircraftSpec.js';
import { carrierTouchdown, hoverMargin, requestCatapult } from '../src/navalOps.js';
import { unitDefinition } from '../src/unitTypes.js';
import { groundMesh, groundHit } from '../src/groundModels.js';

import { serviceAircraft } from '../src/missionStart.js';
import { planLandingRoute } from '../src/landingRoute.js';
test('naval roster has three allies, one 3+1 enemy flight and a destroyer, without a pending second wave', () => {
  const x = navalScenario(),
    air = x.targets.filter((t) => t.team === 'enemy' && t.kind === 'air');
  assert.equal(air.length, 4);
  assert.equal(air.filter((t) => t.type === 'fighter').length, 3);
  assert.equal(air.filter((t) => t.type === 'bomber').length, 1);
  assert.ok(air.every((t) => t.alive && !t.pending && t.wave === 1));
  assert.equal(x.targets.filter((t) => t.team === 'ally' && t.kind === 'air').length, 3);
  assert.deepEqual(unitDefinition('carrier').weapons, ['gun', 'missile']);
  assert.equal(terrainWorld.ocean, true);
});
test('naval hangar allows only carrier-capable types and provides a single-engine Harrier', () => {
  const m = missions.find((m) => m.naval);
  assert.deepEqual(
    missionAircraftChoices(m).map((a) => a.id),
    ['fa18', 'f14', 'harrier'],
  );
  const h = aircraft.find((a) => a.id === 'harrier');
  assert.equal(h.engineCount, 1);
  assert.equal(h.hasAB, false);
  assert.equal(h.thrust, 98750);
});
test('naval terrain stays daytime ocean and unnamed land missions use grass', () => {
  assert.equal(missionSurface({ naval: true }), 'ocean');
  assert.equal(missionSurface({}), 'grass');
});
test('catapult launch accelerates the actual physics aircraft and clears the deck', () => {
  const x = navalScenario('catapult');
  advanceNaval(x, 6, { combat: false });
  assert.equal(x.s.crashed, false);
  assert.equal(x.s.airborne, true);
  assert.equal(x.s.onGround, false);
  assert.ok(x.s.position.y > 22);
  assert.ok(x.s.speed > 70);
});
test('arresting wire catches an actual landing and brings the aircraft to a stop', () => {
  const x = navalScenario('trap');
  advanceNaval(x, 9, { combat: false });
  assert.equal(x.s.crashed, false);
  assert.equal(x.s.naval.arrested, true);
  assert.equal(x.s.onGround, true);
  assert.ok(x.s.speed < 1);
  assert.equal(x.s.landing.success, true);
});
test('missing the wire results in a bolter and airborne go-around, never mission victory', () => {
  const x = navalScenario('bolter');
  advanceNaval(x, 3, { combat: false });
  assert.equal(x.s.crashed, false);
  assert.equal(x.s.naval.arrested, false);
  assert.equal(x.s.naval.bolter, true);
  assert.equal(x.s.onGround, false);
  assert.equal(x.s.landing, null);
  assert.equal(x.m.complete, false);
});
test('Harrier vertical thrust respects mass: light aircraft climbs, overloaded aircraft cannot hover', () => {
  const light = navalScenario('harrier-light');
  assert.ok(hoverMargin(light.s) > 1);
  advanceNaval(light, 10, { combat: false });
  assert.equal(light.s.crashed, false);
  assert.ok(light.s.position.y > 30);
  assert.equal(light.s.airborne, true);
  const heavy = navalScenario('harrier-heavy');
  assert.ok(hoverMargin(heavy.s) < 1);
  advanceNaval(heavy, 5, { combat: false });
  assert.equal(heavy.s.position.y, 22);
  assert.equal(heavy.s.onGround, true);
  assert.equal(requestCatapult(heavy.s), 'KATAPULT NEM ELÉRHETŐ');
});
test('Harrier lands vertically on deck without inventing an arresting hook', () => {
  const x = navalScenario('harrier-land');
  advanceNaval(x, 5, { combat: false });
  assert.equal(x.s.crashed, false);
  assert.equal(x.s.onGround, true);
  assert.equal(x.s.landing?.success, true);
  assert.equal(x.s.naval.arrested, false);
});
test('sea touchdown cannot count as a carrier landing and ship geometry is opaque and hittable', () => {
  const x = navalScenario('trap');
  x.s.position = new Vec3(200, 3, 0);
  x.s.velocity = new Vec3(0, -3, 40);
  x.s.orientation = new Quat();
  x.s.throttle = 0;
  assert.equal(carrierTouchdown(x.s, 1, 70).fatal, true);
  advanceNaval(x, 10, { combat: false });
  assert.equal(x.s.crashed, true);
  for (const type of ['carrier', 'destroyer']) {
    const mesh = groundMesh(type);
    assert.ok(mesh.faces.length > 20);
    assert.ok(mesh.points.every((p) => Number.isFinite(p.x + p.y + p.z)));
    const t = x.targets.find((t) => t.type === type);
    assert.ok(
      groundHit(
        t,
        t.position.clone().add(new Vec3(0, 80, 0)),
        t.position.clone().add(new Vec3(0, -5, 0)),
      ),
    );
  }
});
test('one-flight naval victory still requires the destroyer and safe carrier recovery', () => {
  const x = navalScenario();
  x.s.airborne = true;
  x.s.onGround = false;
  x.s.position.y = 1500;
  for (const t of x.targets.filter((t) => t.team === 'enemy' && t.kind === 'air')) {
    t.alive = false;
    t.falling = false;
  }
  x.m.update(x.s, x.targets, x.w, x.aim);
  assert.equal(x.m.objectiveComplete, false);
  x.targets.find((t) => t.type === 'destroyer').alive = false;
  x.m.update(x.s, x.targets, x.w, x.aim);
  assert.equal(x.m.objectiveComplete, true);
  assert.equal(x.m.complete, false);
  x.s.onGround = true;
  x.s.speed = 0;
  x.s.landing = { success: true };
  x.s.naval.arrested = true;
  x.m.update(x.s, x.targets, x.w, x.aim);
  assert.equal(x.m.complete, true);
});
test('naval service restores fuel and damage while retaining the deck configuration and route ends at the angled wires', () => {
  const x = navalScenario('trap'),
    q = Quat.euler(x.s.airfield.heading, 0, 0),
    route = planLandingRoute(x.s);
  assert.ok(
    route.points.at(-1).distance(q.rotate(new Vec3(0, 22, -80)).add(x.s.airfield.position)) < 1e-6,
  );
  x.s.damage = 30;
  x.s.fuel = 10;
  serviceAircraft(x.s);
  assert.equal(x.s.airfield.carrier, true);
  assert.equal(x.s.fuel, x.s.spec.fuelCapacity);
  assert.equal(x.s.damage, 0);
  assert.equal(x.s.position.y, 22);
});

test('holding full thrust before catapult release cannot roll the fighter off the deck', () => {
  const x = navalScenario();
  x.s.throttle = 1;
  advanceNaval(x, 6, { combat: false });
  assert.equal(x.s.position.z, -115);
  assert.equal(x.s.position.y, 22);
  assert.equal(x.s.onGround, true);
  assert.equal(x.s.crashed, false);
});
test('a conventional carrier recovery cannot complete without an actual wire capture', () => {
  const x = navalScenario('trap');
  for (const t of x.targets.filter((t) => t.team === 'enemy')) {
    t.alive = false;
    t.pending = false;
  }
  x.s.onGround = true;
  x.s.landing = { success: true, descent: 1, offset: 0 };
  x.s.speed = 0;
  x.s.naval.arrested = false;
  x.m.update(x.s, x.targets, x.w, x.aim);
  assert.equal(x.m.complete, false);
  assert.equal(x.m.serviceCount, undefined);
  x.s.naval.arrested = true;
  x.m.update(x.s, x.targets, x.w, x.aim);
  assert.equal(x.m.complete, true);
});
test('fully loaded Harrier performs a short rolling takeoff with forty-five-degree nozzles', () => {
  const x = navalScenario('harrier-heavy');
  x.s.naval.nozzle = 45;
  for (let i = 0; i < 6 * 120; i++) stepAircraft(x.s, { brake: true }, 1 / 120);
  for (let i = 0; i < 13 * 120; i++)
    stepAircraft(
      x.s,
      { pitch: x.s.speed > 42 && attitude(x.s.orientation).pitch < 0.16 ? 0.15 : 0 },
      1 / 120,
    );
  assert.equal(x.s.crashed, false);
  assert.equal(x.s.airborne, true);
  assert.ok(x.s.position.y > 22);
});

test('catapult rotation starts level, rises continuously with rail travel and cannot restart mid-launch', () => {
  const x = navalScenario('catapult');
  let previous = attitude(x.s.orientation).pitch,
    maximum = 0,
    sawAcceleration = false;
  const start = x.s.naval.launchStart;
  for (let i = 0; i < 360 && !x.s.naval.launchComplete; i++) {
    stepAircraft(x.s, {}, 1 / 120);
    const pitch = attitude(x.s.orientation).pitch;
    assert.ok(Math.abs(pitch - previous) < (0.15 * Math.PI) / 180, 'no abrupt camera pitch change');
    if (i === 0) assert.ok(Math.abs(pitch) < (0.05 * Math.PI) / 180);
    maximum = Math.max(maximum, pitch);
    if (x.s.position.z - start > 10 && x.s.speed > 20) sawAcceleration = true;
    if (i === 60) {
      requestCatapult(x.s);
      assert.equal(x.s.naval.launchStart, start);
    }
    previous = pitch;
  }
  assert.ok(sawAcceleration);
  assert.ok(maximum > (5 * Math.PI) / 180);
  assert.equal(x.s.naval.launchComplete, true);
  assert.equal(x.s.crashed, false);
});

test('catapult release has one small nose bob, settles, then rotates for takeoff', () => {
  const x = navalScenario('catapult');
  let peak = 0,
    settled = Infinity;
  const start = x.s.position.z;
  for (let i = 0; i < 360 && !x.s.naval.launchComplete; i++) {
    stepAircraft(x.s, {}, 1 / 120);
    const distance = x.s.position.z - start,
      pitch = (attitude(x.s.orientation).pitch * 180) / Math.PI;
    if (distance < 10) peak = Math.max(peak, pitch);
    if (distance >= 12 && distance <= 18) settled = Math.min(settled, pitch);
  }
  assert.ok(peak > 1 && peak < 2.5);
  assert.ok(settled < peak - 0.5);
  assert.ok((attitude(x.s.orientation).pitch * 180) / Math.PI > 5);
  assert.equal(x.s.crashed, false);
  assert.equal(x.s.naval.launchComplete, true);
});

test('naval mission never spawns another flight after survivors withdraw or after all four are defeated', () => {
  const x = navalScenario(),
    air = x.targets.filter((t) => t.team === 'enemy' && t.kind === 'air');
  x.s.onGround = false;
  x.s.airborne = true;
  x.s.position.y = 1500;
  for (const t of air) {
    t.exited = true;
    t.service = { stage: 'offmap' };
    t.retreat = { reason: 'resupply' };
  }
  x.s.elapsed = 450;
  x.m.update(x.s, x.targets, x.w, x.aim);
  assert.match(x.m.objectives.find((o) => o.id === 'waves').text, /4 gép újratölt/);
  for (const t of air) {
    t.alive = false;
    t.falling = false;
  }
  x.s.elapsed = 1000;
  x.m.update(x.s, x.targets, x.w, x.aim);
  assert.equal(x.targets.filter((t) => t.team === 'enemy' && t.kind === 'air').length, 4);
  assert.ok(!x.targets.some((t) => t.pending));
  assert.equal(x.m.navalNextWaveAt, undefined);
  assert.equal(x.m.wave, 1);
  assert.match(x.m.objectives.find((o) => o.id === 'waves').text, /4\/4/);
});

test('ship hulls have complete symmetric bows and a closed five-sided envelope', () => {
  for (const type of ['destroyer', 'carrier']) {
    const mesh = groundMesh(type),
      hull = mesh.faces.slice(0, 7),
      edges = new Map();
    assert.equal(hull[0].length, 5);
    assert.equal(hull[1].length, 5);
    for (const face of hull) {
      for (let i = 0; i < face.length; i++) {
        const a = face[i],
          b = face[(i + 1) % face.length];
        const key = [a, b].sort((a, b) => a - b).join(':');
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    assert.ok(
      [...edges.values()].every((count) => count === 2),
      `${type}: open hull`,
    );
    for (const face of hull.slice(0, 2)) {
      const points = face.map((i) => mesh.points[i]);
      for (const p of points)
        assert.ok(
          points.some((q) => q.x === -p.x && q.y === p.y && q.z === p.z),
          `${type}: asymmetric bow`,
        );
    }
    const L = type === 'carrier' ? 160 : 75,
      W = type === 'carrier' ? 34 : 9;
    const target = { type, position: new Vec3(), heading: 0 };
    for (const side of [-1, 1])
      assert.ok(
        groundHit(
          target,
          new Vec3(side * W * 0.6, 80, L * 0.55),
          new Vec3(side * W * 0.6, -5, L * 0.55),
        ),
        `${type}: missing forward ${side} deck`,
      );
  }
});
