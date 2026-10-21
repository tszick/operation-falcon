import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft } from '../src/aircraftSpec.js';
import { createAircraft } from '../src/physics.js';
import { Vec3, Quat } from '../src/math.js';
import { mapPoint, tacticalMapState } from '../src/tacticalMap.js';
const s = () => {
  const p = createAircraft(aircraft.find((a) => a.id === 'f16'));
  p.position = new Vec3(0, 1000, 0);
  p.velocity = new Vec3(0, 0, 100);
  return p;
};
const contact = (id, x, z, vx = 0, vz = -100) => ({
  id,
  alive: true,
  kind: 'air',
  position: new Vec3(x, 1000, z),
  velocity: new Vec3(vx, 0, vz),
  heading: 0,
});
test('map shows every live contact within the physical radar cone and range, but excludes hidden units', () => {
  const p = s(),
    targets = [
      contact('a', 1000, 5000),
      contact('b', -1000, 5000),
      contact('behind', 0, -5000),
      contact('far', 0, 200000),
      { ...contact('dead', 0, 5000), alive: false },
    ];
  assert.deepEqual(
    tacticalMapState(p, targets).contacts.map((c) => c.target.id),
    ['a', 'b'],
  );
  p.orientation = Quat.euler(Math.PI, 0, 0);
  assert.deepEqual(
    tacticalMapState(p, targets).contacts.map((c) => c.target.id),
    ['behind'],
  );
});
test('enemy heading arrows follow ground velocity rather than an old nose heading', () => {
  const map = tacticalMapState(s(), [
    contact('east', 0, 5000, 100, 0),
    contact('south', 0, 6000, 0, -100),
  ]);
  assert.equal(map.contacts[0].motionHeading, Math.PI / 2);
  assert.equal(map.contacts[1].motionHeading, Math.PI);
});
test('larger map expands without revealing hidden contacts and keeps own aircraft and base in bounds', () => {
  const p = s();
  let map = tacticalMapState(p, []);
  assert.equal(map.halfExtent, 30000);
  p.position = new Vec3(250000, 1000, -150000);
  map = tacticalMapState(p, [contact('hidden', 0, 1e9)]);
  assert.equal(map.contacts.length, 0);
  const own = mapPoint(p.position, map);
  assert.ok(own.x >= 12 && own.x <= 228 && own.y >= 12 && own.y <= 228);
  assert.deepEqual(mapPoint(new Vec3(), map), { x: 120, y: 120 });
  assert.ok(map.halfExtent >= 300000);
});
test('landing map zooms in when the runway corridor is active', () => {
  const p = s();
  p.approach = { active: true };
  assert.equal(tacticalMapState(p, []).halfExtent, 10000);
});
