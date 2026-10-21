import { defenseState } from '../src/aiDefense.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, Quat } from '../src/math.js';
import { aircraft } from '../src/aircraftSpec.js';
import { createAircraft, STEP } from '../src/physics.js';
import { Weapons } from '../src/weapons.js';
import { Targeting } from '../src/targeting.js';
const airborne = () => {
  const s = createAircraft(aircraft.find((a) => a.id === 'f16'));
  s.position = new Vec3(0, 500, 0);
  s.velocity = new Vec3(0, 0, 150);
  s.orientation = new Quat();
  s.onGround = false;
  s.airborne = true;
  return s;
};
test('firing emits exactly one weapon event, and draining consumes it', () => {
  const s = airborne(),
    w = new Weapons();
  w.selected = 'gun';
  w.fire(s, [], new Targeting());
  const events = w.drainEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'gun');
  assert.equal(w.effects[0].kind, 'muzzle');
  assert.deepEqual(w.drainEvents(), []);
  w.fire(s, [], new Targeting());
  assert.deepEqual(w.drainEvents(), []);
});
test('a rejected missile launch emits no launch sound event or projectile', () => {
  const s = airborne(),
    w = new Weapons();
  w.selected = 'aam';
  w.fire(s, [], new Targeting());
  assert.equal(w.projectiles.length, 0);
  assert.deepEqual(w.drainEvents(), []);
});
test('a hit produces a single explosion event and fragments without a duplicate ground blast', () => {
  const s = airborne(),
    w = new Weapons();
  s.position = new Vec3(0, 2, 0);
  s.velocity = new Vec3();
  const t = {
    id: 'T',
    alive: true,
    kind: 'ground',
    radius: 30,
    position: new Vec3(0, 0, 0),
    velocity: new Vec3(),
  };
  w.selected = 'bomb';
  w.fire(s, [t], new Targeting());
  w.drainEvents();
  for (let i = 0; i < 10; i++) w.update(s, [t], STEP);
  assert.equal(w.hits, 1);
  assert.equal(w.effects.filter((e) => e.kind === 'explosion').length, 1);
  assert.equal(w.drainEvents().filter((e) => e.type === 'explosion').length, 1);
  assert.ok(w.effects[0].particles.length >= 20);
  for (let i = 0; i < 60; i++) w.update(s, [t], STEP);
  assert.equal(w.drainEvents().length, 0);
});
test('rocket trails persist independently after the missile hits, then expire', () => {
  const s = airborne(),
    w = new Weapons(),
    t = {
      id: 'T',
      alive: true,
      kind: 'air',
      radius: 28,
      position: new Vec3(0, 500, 450),
      velocity: new Vec3(),
    },
    aim = { id: 'T', locked: true };
  Object.assign(defenseState(t).countermeasures, { flare: 0, chaff: 0 });
  w.fire(s, [t], aim);
  for (let i = 0; i < 240 && !w.damageHits; i++) w.update(s, [t], STEP);
  assert.equal(w.damageHits, 1);
  assert.equal(t.flight.damage, 50);
  assert.equal(w.projectiles.length, 0);
  assert.ok(w.trails.length > 0);
  for (let i = 0; i < 720; i++) w.update(s, [t], STEP);
  assert.equal(w.trails.length, 0);
  assert.equal(w.effects.length, 0);
});
test('gun ground impacts make small sparks; bombs make a full ground explosion', () => {
  const w = new Weapons(),
    position = new Vec3();
  w.explode(position, 'gun', { ground: true });
  assert.equal(w.effects[0].kind, 'impact');
  assert.equal(w.events.length, 0);
  w.explode(position, 'bomb', { ground: true });
  assert.equal(w.effects[1].kind, 'explosion');
  assert.equal(w.effects[1].ground, true);
  assert.equal(w.events[0].heavy, true);
});
