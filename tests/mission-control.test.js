import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft, missions } from '../src/aircraftSpec.js';
import { createAircraft } from '../src/physics.js';
import { serviceAircraft } from '../src/missionStart.js';
import { Vec3, Quat } from '../src/math.js';
import { Mission } from '../src/mission.js';
import { missionControlSnapshot } from '../src/missionControl.js';
import { tacticalMapState, mapPoint, nextMapZoom, renderTacticalMap } from '../src/tacticalMap.js';
const scene = () => {
  const s = createAircraft(aircraft.find((a) => a.id === 'f16'));
  s.position = new Vec3(12000, 1800, 9000);
  s.velocity = new Vec3(0, 0, 150);
  s.orientation = new Quat();
  return { s, m: new Mission(missions.find((m) => m.id === 'iron-veil')), aim: { id: null } };
};
const unit = (id, x, z, extra = {}) => ({
  id,
  name: id,
  kind: 'air',
  alive: true,
  team: 'enemy',
  position: new Vec3(x, 1800, z),
  velocity: new Vec3(0, 0, -100),
  ...extra,
});

test('three map levels cycle one way and multiply scale without moving own aircraft out of view', () => {
  let level = 1;
  const sequence = [];
  for (let i = 0; i < 6; i++) {
    level = nextMapZoom(level);
    sequence.push(level);
  }
  assert.deepEqual(sequence, [2, 3, 1, 2, 3, 1]);
  assert.equal(nextMapZoom(undefined), 2);
  const { s } = scene(),
    normal = tacticalMapState(s, []);
  for (const zoom of [1, 2, 3]) {
    const map = tacticalMapState(s, [], { zoom });
    assert.equal(map.scale, normal.scale * 2 ** (zoom - 1));
    if (zoom > 1) assert.deepEqual(mapPoint(s.position, map), { x: 120, y: 120 });
  }
});

test('zoom follows movement, translates base consistently, and preserves isotropic world coordinates', () => {
  const { s } = scene();
  s.mapZoom = 3;
  let map = tacticalMapState(s, [], { width: 400, height: 300 }),
    own = mapPoint(s.position, map),
    base = mapPoint(new Vec3(), map);
  assert.deepEqual(own, { x: 200, y: 150 });
  assert.ok(Math.abs(own.x - base.x - s.position.x * map.scale) < 1e-9);
  assert.ok(Math.abs(base.y - own.y - s.position.z * map.scale) < 1e-9);
  const east = mapPoint(s.position.clone().add(new Vec3(1000, 0, 0)), map),
    north = mapPoint(s.position.clone().add(new Vec3(0, 0, 1000)), map);
  assert.ok(Math.abs(east.x - own.x - (own.y - north.y)) < 1e-9);
  s.position.x += 700;
  map = tacticalMapState(s, [], { width: 400, height: 300 });
  assert.deepEqual(mapPoint(s.position, map), own);
});

test('paused chart preserves sensor range and cone for friend and foe at every magnification', () => {
  const { s, m, aim } = scene(),
    targets = [
      unit('hostile', 12000, 14000),
      unit('ally', 13000, 14000, { team: 'ally', radioCallSign: { flight: 'Viper', number: 2 } }),
      unit('behind', 12000, 4000),
      unit('far', 12000, 300000),
      unit('pending', 12000, 13000, { alive: false, pending: true }),
      unit('dead', 12000, 15000, { alive: false }),
    ];
  for (const zoom of [1, 2, 3]) {
    const snap = missionControlSnapshot(s, m, targets, aim, { zoom });
    assert.deepEqual(
      snap.map.contacts.map((c) => c.target.id),
      ['hostile', 'ally'],
    );
    assert.equal(snap.contacts.find((c) => c.id === 'ally').label, 'Viper Two');
    assert.ok(!snap.contacts.some((c) => ['behind', 'far', 'pending', 'dead'].includes(c.id)));
  }
});

test('jamming removes contacts and navigation from both map views and all three levels', () => {
  const { s, m, aim } = scene(),
    targets = [
      unit('hostile', 12000, 14000),
      unit('jammer', 12500, 10000, { kind: 'ground', type: 'jammer', jamRadius: 7000 }),
    ];
  for (const zoom of [1, 2, 3]) {
    const snap = missionControlSnapshot(s, m, targets, aim, { zoom });
    assert.equal(snap.map.jammed, true);
    assert.equal(snap.map.landingRoute, null);
    assert.deepEqual(snap.contacts, []);
    assert.deepEqual(snap.map.contacts, []);
  }
});

test('full objective list retains done, pending, failed and optional goals without changing simulation state', () => {
  const { s, m, aim } = scene();
  m.objectives = [
    { id: 'a', text: 'A', done: true },
    { id: 'b', text: 'B', done: false },
    { id: 'c', text: 'C', done: false, status: 'failed', optional: true },
    ...Array.from({ length: 12 }, (_, i) => ({
      id: 'goal' + i,
      text: 'Goal ' + i,
      done: false,
      optional: true,
    })),
  ];
  s.elapsed = 123.5;
  const before = JSON.stringify({ s, m });
  const snap = missionControlSnapshot(s, m, [], aim);
  assert.equal(snap.card.rows.length, 15);
  assert.deepEqual(
    snap.card.rows.slice(0, 3).map((r) => r.status),
    ['done', 'pending', 'failed'],
  );
  assert.equal(snap.elapsed, 123.5);
  assert.equal(JSON.stringify({ s, m }), before);
  m.aborted = true;
  m.objectives = [
    { id: 'return', text: 'Return', done: false },
    ...m.objectives.map((o) => ({ ...o, status: o.done ? 'done' : 'failed' })),
  ];
  assert.equal(missionControlSnapshot(s, m, [], aim).card.rows[0].id, 'return');
});

test('chart zoom is independent of cockpit zoom and service retains cockpit preference', () => {
  const { s, m, aim } = scene();
  s.mapZoom = 3;
  assert.equal(missionControlSnapshot(s, m, [], aim, { zoom: 1 }).map.zoom, 1);
  assert.equal(s.mapZoom, 3);
  serviceAircraft(s);
  assert.equal(s.mapZoom, 3);
});

test('moving a magnified map reuses padded contour tiles rather than regenerating each frame', () => {
  const { s, aim } = scene();
  s.position.x = 123456;
  s.position.z = -87654;
  s.mapZoom = 3;
  let created = 0;
  const original = globalThis.document;
  const c = new Proxy(
      {},
      {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: (target, key, value) => ((target[key] = value), true),
      },
    ),
    canvas = { width: 253, height: 279, getContext: () => c };
  globalThis.document = {
    createElement() {
      created++;
      return { getContext: () => c };
    },
  };
  try {
    renderTacticalMap(canvas, s, [], aim);
    assert.equal(created, 1);
    s.position.x += 5;
    s.position.z += 5;
    renderTacticalMap(canvas, s, [], aim);
    assert.equal(created, 1);
  } finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
});
