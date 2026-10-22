import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, Quat } from '../src/math.js';
import { aircraft } from '../src/aircraftSpec.js';
import { createAircraft, stepAircraft } from '../src/physics.js';
import { Weapons } from '../src/weapons.js';
import { configureTerrain, terrainHeight } from '../src/terrain.js';
import { updateTargets } from '../src/targeting.js';
import { updateAircraftCollisions } from '../src/aircraftCollisions.js';
import { groundAircraftHit } from '../src/groundModels.js';
const spec = aircraft.find((a) => a.id === 'f16');
function plane(x = 0, y = 1000, z = 0) {
  const s = createAircraft(spec);
  Object.assign(s, {
    position: new Vec3(x, y, z),
    previousPosition: new Vec3(x, y, z),
    orientation: new Quat(),
    onGround: false,
    airborne: true,
    gear: false,
    flaps: false,
    flapPosition: 0,
    velocity: new Vec3(0, 0, 200),
  });
  return s;
}
function unit(id, s, team = 'enemy') {
  return {
    id,
    kind: 'air',
    type: 'fighter',
    aircraftId: spec.id,
    team,
    alive: true,
    position: s.position,
    previousPosition: s.previousPosition,
    velocity: s.velocity,
    flight: s,
  };
}
function ground(type, health = 60) {
  return {
    id: type,
    kind: 'ground',
    type,
    alive: true,
    position: new Vec3(),
    velocity: new Vec3(),
    heading: 0,
    health,
    maxHealth: health,
  };
}
function reset() {
  configureTerrain({ id: 'landing' }, undefined, () => 0.99);
}
test('swept head-on collision sends both player and AI into an actual fatal fall, including friendly aircraft', () => {
  for (const team of ['enemy', 'ally']) {
    reset();
    const s = plane(),
      other = plane(),
      t = unit('OTHER', other, team),
      w = new Weapons();
    s.previousPosition.z = -60;
    other.previousPosition.z = 60;
    other.velocity.z = -200;
    other.orientation = Quat.euler(Math.PI, 0, 0);
    updateAircraftCollisions(s, [t], w);
    assert.equal(s.dying, true);
    assert.equal(other.dying, true);
    assert.equal(s.crashed, false);
    assert.equal(t.falling, true);
    assert.equal(t.alive, false);
    assert.equal(s.velocity.z, 200);
    const count = w.events.length;
    updateAircraftCollisions(s, [t], w);
    assert.equal(w.events.length, count, 'Contact is recorded once');
    for (let i = 0; i < 120 * 60 && (!s.crashed || !t.flight.crashed); i++) {
      stepAircraft(s, {}, 1 / 120);
      updateTargets([t], 1 / 120);
    }
    assert.equal(s.crashed, true);
    assert.equal(t.flight.crashed, true);
  }
});
test('AI against AI is symmetric, while nearby nonintersecting aircraft remain intact', () => {
  reset();
  const player = plane(5000),
    a = plane(),
    b = plane(),
    w = new Weapons();
  a.previousPosition.z = -60;
  b.previousPosition.z = 60;
  b.orientation = Quat.euler(Math.PI, 0, 0);
  const one = unit('A', a, 'ally'),
    two = unit('B', b);
  updateAircraftCollisions(player, [one, two], w);
  assert.equal(a.dying, true);
  assert.equal(b.dying, true);
  assert.equal(player.dying, false);
  const near = plane(),
    clear = unit('CLEAR', plane(25));
  updateAircraftCollisions(near, [clear], new Weapons());
  assert.equal(near.dying, false);
  assert.equal(clear.alive, true);
});
test('ramming a truck destroys it and the aircraft, while a carrier absorbs the impact with partial damage', () => {
  for (const [type, health, y] of [
    ['truck', 60, 3],
    ['carrier', 600, 10],
  ]) {
    reset();
    const s = plane(0, y, 230),
      t = ground(type, health),
      w = new Weapons();
    s.previousPosition.z = -230;
    updateAircraftCollisions(s, [t], w);
    assert.equal(s.dying, true, type);
    if (type === 'truck') assert.equal(t.alive, false);
    else {
      assert.equal(t.alive, true);
      assert.ok(t.health < 600 && t.health > 0);
    }
    const before = t.health;
    updateAircraftCollisions(s, [t], w);
    assert.equal(t.health, before);
    assert.ok(w.events.some((e) => e.type === 'collision' && e.energyJ > 0));
  }
});
test('airfield empty runway space is clear but the actual hangars collide, including the origin base', () => {
  reset();
  const remote = ground('airbase', 240);
  remote.position = new Vec3(5000, 0, 6000);
  const height = terrainHeight(5000, 6000) + 2;
  assert.equal(
    groundAircraftHit(remote, new Vec3(5000, height, 5900), new Vec3(5000, height, 6100)),
    null,
  );
  const home = { ...ground('airbase', 240), home: true };
  assert.equal(groundAircraftHit(home, new Vec3(0, 2, -1000), new Vec3(0, 2, 1000)), null);
  const s = plane(190, 5, -800);
  s.previousPosition.z = -1050;
  updateAircraftCollisions(s, [home], new Weapons());
  assert.equal(s.dying, true);
  assert.ok(home.health < 240);
});
test('a low-speed ground collision is fatal to the aircraft and damages the obstacle', () => {
  reset();
  const s = plane(0, 3, 10),
    truck = ground('truck'),
    w = new Weapons();
  s.onGround = true;
  s.gear = true;
  s.velocity.z = 3;
  s.previousPosition.z = -15;
  updateAircraftCollisions(s, [truck], w);
  assert.equal(s.crashed, true);
  assert.equal(truck.health, 55);
});
test('the common weapon update invokes collision handling for aircraft in every mission', () => {
  reset();
  const s = plane(),
    other = plane(),
    w = new Weapons();
  s.previousPosition.z = -60;
  other.previousPosition.z = 60;
  w.update(s, [unit('ENEMY', other)], 1 / 120);
  assert.equal(s.dying, true);
  assert.equal(other.dying, true);
});

test('a weakened large object can also be destroyed and an AI aircraft follows the same ground impact rules', () => {
  reset();
  const p = plane(5000),
    f = plane(0, 10, 230),
    carrier = ground('carrier', 600),
    w = new Weapons();
  f.previousPosition.z = -230;
  carrier.health = 10;
  const target = unit('AI-RAM', f, 'ally');
  updateAircraftCollisions(p, [target, carrier], w);
  assert.equal(f.dying, true);
  assert.equal(carrier.alive, false);
  assert.equal(carrier.health, 0);
  assert.equal(p.dying, false);
});
