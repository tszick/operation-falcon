import { Weapons } from '../src/weapons.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import {
  neutralAxes,
  validCommand,
  NETWORK_STEP,
  EVENT_LIMIT,
} from '../src/multiplayer/protocol.js';
import { NetworkCombatView } from '../src/multiplayer/combatView.js';
import { predictBombImpact } from '../src/weaponDynamics.js';
import { weaponProfile } from '../src/weaponDynamics.js';
import { Vec3, Quat, forward } from '../src/math.js';
import { unpackFlight } from '../src/multiplayer/flightState.js';
function fixture() {
  const rooms = new MultiplayerRooms(),
    room = rooms.create(),
    one = rooms.join(room, 'f16'),
    two = rooms.join(room, 'fa18');
  return { rooms, room, one, two };
}
function control(rooms, p, combat = {}) {
  assert.equal(
    rooms.inputs(p, [
      {
        seq: p.received + 1,
        axes: neutralAxes(),
        toggles: [],
        combat: {
          weapon: p.combat.weapons.selected,
          fire: false,
          cycle: false,
          countermeasures: false,
          ...combat,
        },
      },
    ]),
    true,
  );
}
function run(rooms, seconds) {
  for (let i = 0; i < Math.round(seconds / NETWORK_STEP); i++) rooms.step();
}
test('combat inputs cannot inject locks, targets, damage, ammunition or rapid-fire timing', () => {
  const base = {
    seq: 1,
    axes: neutralAxes(),
    toggles: [],
    combat: { weapon: 'aam', fire: true, cycle: false, countermeasures: false },
  };
  assert.equal(validCommand(base), true);
  for (const extra of [
    { locked: true },
    { targetId: 'RANGE-AIR' },
    { damage: 100 },
    { ammo: 9999 },
    { dt: 1 },
    { weapon: 'nuclear' },
    { fire: 1 },
  ])
    assert.equal(validCommand({ ...base, combat: { ...base.combat, ...extra } }), false);
});
test('simultaneous gun commands have independent ammunition, cooldowns and globally distinct shot IDs', () => {
  const { rooms, room, one, two } = fixture();
  const a = one.state.ammo.gun,
    b = two.state.ammo.gun;
  for (const p of [one, two]) control(rooms, p, { fire: true });
  rooms.step();
  assert.equal(one.state.ammo.gun, a - 1);
  assert.equal(two.state.ammo.gun, b - 1);
  assert.equal(room.combat.weapons.projectiles.length, 2);
  assert.equal(new Set(room.combat.weapons.projectiles.map((p) => p.id)).size, 2);
  assert.deepEqual(new Set(room.combat.events.map((e) => e.sourceId)), new Set([one.id, two.id]));
  for (let i = 0; i < 5; i++) {
    control(rooms, one, { fire: true });
    rooms.step();
  }
  assert.equal(
    one.state.ammo.gun,
    a - 1,
    'faster command delivery cannot bypass the physical cooldown',
  );
  assert.equal(two.state.ammo.gun, b - 1);
});
test('a held fire button with no subsequent packets cannot fire on its own or refill an empty magazine', () => {
  const { rooms, one } = fixture();
  one.state.ammo.gun = 1;
  control(rooms, one, { fire: true });
  rooms.step();
  run(rooms, 1);
  assert.equal(one.state.ammo.gun, 0);
  control(rooms, one, { fire: true });
  rooms.step();
  assert.equal(one.state.ammo.gun, 0);
  assert.match(one.combat.feedback, /LŐSZER/);
});
test('missiles require a server-earned lock and the shared missile physically damages the target', () => {
  const { rooms, room, one } = fixture();
  const ammo = one.state.ammo.aam;
  control(rooms, one, { weapon: 'aam', fire: true });
  rooms.step();
  assert.equal(one.state.ammo.aam, ammo);
  assert.equal(room.combat.weapons.projectiles.length, 0);
  control(rooms, one, { weapon: 'aam', cycle: true });
  rooms.step();
  run(rooms, 3);
  assert.equal(one.combat.aim.id, 'RANGE-AIR');
  assert.equal(one.combat.aim.locked, true);
  control(rooms, one, { weapon: 'aam', fire: true });
  rooms.step();
  assert.equal(one.state.ammo.aam, ammo - 1);
  const id = room.combat.weapons.projectiles[0].id;
  run(rooms, 20);
  const hit = room.combat.events.find((e) => e.type === 'target-hit' && e.projectileId === id);
  assert.equal(hit.sourceId, one.id);
  assert.equal(hit.targetId, 'RANGE-AIR');
  assert.ok(hit.amount > 0);
  assert.ok(room.combat.targets[0].flight.damage > 0);
  assert.ok(room.combat.events.some((e) => e.type === 'explosion'));
});
function incoming(room, player, owner) {
  const f = forward(player.state.orientation);
  const position = player.state.position.clone().add(f.clone().scale(40));
  room.combat.weapons.projectiles.push({
    id: ++room.combat.weapons.sequence,
    type: 'gun',
    owner,
    sourceId: 'TEST-SOURCE',
    targetEntityId: player.id,
    profile: weaponProfile(player.state.spec, 'gun'),
    position,
    previous: position.clone(),
    velocity: f.scale(-1000),
    age: 0,
    damage: 18,
  });
}
test('the common hit solver damages the actual player aircraft by part and replicates that condition', () => {
  const { rooms, room, one } = fixture();
  incoming(room, one, 'enemy');
  run(rooms, 0.15);
  assert.ok(one.state.damage > 0);
  const hit = room.combat.events.find((e) => e.type === 'target-hit' && e.targetId === one.id);
  assert.ok(hit.part);
  assert.ok(hit.amount > 0);
  const restored = unpackFlight(rooms.snapshot(room).players.find((p) => p.id === one.id).state);
  assert.equal(restored.damage, one.state.damage);
  assert.deepEqual(restored.condition.parts, one.state.condition.parts);
});
test('friendly projectiles damage a different pilot with the same physical hit model', () => {
  const { rooms, room, one, two } = fixture();
  incoming(room, one, 'ally');
  room.combat.weapons.projectiles[0].sourceId = two.id;
  run(rooms, 0.2);
  assert.ok(one.state.damage > 0);
  assert.equal(two.state.damage, 0);
  assert.equal(two.combat.friendlyHits, 1);
  assert.equal(two.combat.hits, 0);
  assert.equal(two.combat.kills, 0);
  assert.ok(
    room.combat.events.some(
      (e) => e.type === 'target-hit' && e.targetId === one.id && e.friendlyFire,
    ),
  );
});
test('ground-attack launch checks still reject air targets and out-of-range or off-axis targets', () => {
  const { rooms, room, one } = fixture();
  control(rooms, one, { weapon: 'agm', cycle: true });
  rooms.step();
  run(rooms, 3);
  assert.equal(one.combat.aim.id, 'RANGE-AIR');
  const ammo = one.state.ammo.agm;
  control(rooms, one, { fire: true });
  rooms.step();
  assert.equal(one.state.ammo.agm, ammo);
  const target = room.combat.targets[0];
  target.position = target.flight.position = new Vec3(0, 3000, 190000);
  control(rooms, one, { weapon: 'aam', fire: true });
  rooms.step();
  assert.equal(one.state.ammo.aam, 2);
});
test('countermeasure inventory is authoritative, finite and preserved across prediction snapshots', () => {
  const { rooms, room, one } = fixture(),
    before = one.state.countermeasures.flare;
  control(rooms, one, { countermeasures: true });
  rooms.step();
  assert.equal(one.state.countermeasures.flare, before - 2);
  control(rooms, one, { countermeasures: true });
  rooms.step();
  assert.equal(one.state.countermeasures.flare, before - 2);
  const s = unpackFlight(rooms.snapshot(room).players.find((p) => p.id === one.id).state);
  assert.ok(s.countermeasures.decoys[0].position instanceof Vec3);
  assert.equal(s.countermeasures.flare, before - 2);
});
test('clients reconstruct explosions once, keep muzzle flashes at their shooter and restore ongoing effects on late join', () => {
  const { rooms, room, one } = fixture();
  control(rooms, one, { fire: true });
  rooms.step();
  room.combat.weapons.explode(new Vec3(10, 20, 30), 'bomb');
  rooms.step();
  const snapshot = JSON.parse(JSON.stringify(rooms.snapshot(room))),
    a = new NetworkCombatView(),
    b = new NetworkCombatView();
  a.accept(snapshot);
  b.accept(snapshot, true);
  const first = a.sample(snapshot.time),
    second = b.sample(snapshot.time);
  assert.equal(first.effects.length, second.effects.length);
  assert.ok(first.effects.some((e) => e.kind === 'explosion'));
  assert.ok(first.effects.find((e) => e.kind === 'muzzle').fixedPosition instanceof Vec3);
  assert.deepEqual(
    first.effects.find((e) => e.kind === 'explosion').particles,
    second.effects.find((e) => e.kind === 'explosion').particles,
  );
  const next = { ...snapshot, tick: snapshot.tick + 1, time: snapshot.time + NETWORK_STEP };
  a.accept(next);
  assert.equal(a.effects.length, first.effects.length);
});
test('combat event retention and serialized snapshots remain bounded during sustained two-pilot fire', () => {
  const { rooms, room, one, two } = fixture();
  for (let i = 0; i < 1200; i++) {
    for (const p of [one, two]) control(rooms, p, { fire: true });
    rooms.step();
  }
  const packet = JSON.stringify(rooms.snapshot(room));
  assert.ok(room.combat.events.length <= EVENT_LIMIT);
  assert.ok(
    Buffer.byteLength(packet) < 128 * 1024,
    `snapshot is ${Buffer.byteLength(packet)} bytes`,
  );
  assert.ok(room.combat.weapons.projectiles.length < 192);
});

test('a valid ground lock permits an air-to-ground missile to destroy the common vehicle', () => {
  const { rooms, room, one } = fixture(),
    target = room.combat.targets[1];
  one.state.position = target.position.clone().add(new Vec3(0, 400, -1200));
  one.state.orientation = Quat.euler(0, -Math.atan2(400, 1200), 0);
  one.state.velocity = forward(one.state.orientation).scale(180);
  control(rooms, one, { weapon: 'agm', cycle: true });
  rooms.step();
  run(rooms, 2);
  assert.equal(one.combat.aim.id, target.id);
  assert.equal(one.combat.aim.locked, true);
  control(rooms, one, { fire: true });
  rooms.step();
  run(rooms, 4);
  assert.equal(target.alive, false);
  assert.equal(one.state.ammo.agm, 1);
  assert.ok(
    room.combat.events.some((e) => e.type === 'target-hit' && e.weapon === 'agm' && e.destroyed),
  );
});
test('a released bomb follows the existing ballistic solver and damages the shared ground target', () => {
  const { rooms, room, one } = fixture(),
    target = room.combat.targets[1];
  one.state.position = new Vec3(600, 1000, -3000);
  one.state.orientation = new Quat();
  one.state.velocity = new Vec3(0, 0, 180);
  target.position = predictBombImpact(one.state);
  control(rooms, one, { weapon: 'bomb', fire: true });
  rooms.step();
  run(rooms, 20);
  assert.equal(one.state.ammo.bomb, 1);
  assert.ok(target.damage > 0);
  assert.ok(target.health < target.maxHealth);
  assert.ok(room.combat.events.some((e) => e.type === 'bomb-release' && e.sourceId === one.id));
  assert.ok(room.combat.events.some((e) => e.type === 'target-hit' && e.weapon === 'bomb'));
});

test('friendly armed missiles and falling bombs damage other pilots and never their own source', () => {
  for (const type of ['aam', 'bomb']) {
    const { rooms, room, one, two } = fixture();
    const f = forward(one.state.orientation);
    const position = one.state.position
      .clone()
      .add(type === 'aam' ? f.clone().scale(40) : new Vec3(0, 10, 0));
    room.combat.weapons.projectiles.push({
      id: ++room.combat.weapons.sequence,
      type,
      owner: 'ally',
      sourceId: two.id,
      targetEntityId: one.id,
      profile: weaponProfile(two.state.spec, type),
      position,
      previous: position.clone(),
      velocity:
        type === 'aam' ? f.scale(-800) : one.state.velocity.clone().add(new Vec3(0, -100, 0)),
      age: type === 'aam' ? 2 : 0,
      travelled: 1000,
      trailTimer: 0,
      trailAnchor: position.clone(),
      damage: 50,
    });
    run(rooms, 0.25);
    assert.ok(one.state.damage > 0, type);
    assert.equal(two.state.damage, 0, type);
    assert.ok(
      room.combat.events.some(
        (e) => e.type === 'target-hit' && e.friendlyFire && e.weapon === type,
      ),
      type,
    );
  }
});
test('friendly fire retains its attribution when the launching pilot has disconnected', () => {
  const { rooms, room, one, two } = fixture();
  incoming(room, one, 'ally');
  room.combat.weapons.projectiles[0].sourceId = two.id;
  rooms.leave(room, two);
  run(rooms, 0.2);
  assert.ok(one.state.damage > 0);
  const hit = room.combat.events.find((e) => e.type === 'target-hit');
  assert.equal(hit.friendlyFire, true);
  assert.equal(hit.sourceId, two.id);
});

test('wire serialization matches isolated snapshots without copying every flight again', (t) => {
  const { rooms, room, one } = fixture();
  control(rooms, one, { countermeasures: true });
  rooms.step();
  const clone = globalThis.structuredClone;
  let calls = 0;
  t.mock.method(globalThis, 'structuredClone', (...args) => {
    calls++;
    return clone(...args);
  });
  const expected = JSON.stringify(rooms.snapshot(room)),
    snapshotCopies = calls;
  calls = 0;
  const actual = rooms.serialize(room);
  assert.equal(actual, expected);
  assert.ok(calls < snapshotCopies);
  const parsed = JSON.parse(actual);
  parsed.players[0].state.ammo.gun = 0;
  assert.notEqual(one.state.ammo.gun, 0);
});
test('the server emits gameplay events without allocating cosmetic weapon effects, and clients still draw explosions', () => {
  const { rooms, room, one } = fixture();
  assert.equal(room.combat.weapons.visualEffects, false);
  assert.equal(one.combat.weapons.visualEffects, false);
  control(rooms, one, { fire: true });
  rooms.step();
  room.combat.weapons.explode(new Vec3(0, 100, 0), 'bomb');
  rooms.step();
  assert.equal(room.combat.weapons.effects.length, 0);
  assert.equal(room.combat.weapons.trails.length, 0);
  assert.equal(one.combat.weapons.effects.length, 0);
  const view = new NetworkCombatView();
  view.accept(JSON.parse(rooms.serialize(room)), true);
  assert.ok(view.effects.some((e) => e.kind === 'explosion' && e.particles.length > 0));
});
test('interpolated projectile vectors remain isolated from packets and earlier render frames', () => {
  const view = new NetworkCombatView();
  const projectile = {
    id: 1,
    type: 'gun',
    profile: 'm61',
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 10, y: 0, z: 0 },
    age: 0,
  };
  const a = {
      tick: 0,
      time: 0,
      combat: { targets: [], projectiles: [projectile], events: [], eventSequence: 0 },
    },
    b = structuredClone(a);
  b.tick = 120;
  b.time = 1;
  b.combat.projectiles[0].position = { x: 10, y: 20, z: 30 };
  b.combat.projectiles[0].age = 1;
  view.accept(a);
  view.accept(b);
  const first = view.sample(0.5).projectiles[0];
  assert.deepEqual(first.position, new Vec3(5, 10, 15));
  assert.equal(first.age, 0.5);
  first.position.x = 999;
  first.velocity.x = 999;
  const next = view.sample(0.75).projectiles[0];
  assert.deepEqual(next.position, new Vec3(7.5, 15, 22.5));
  assert.equal(next.velocity.x, 10);
  assert.equal(a.combat.projectiles[0].position.x, 0);
  assert.equal(b.combat.projectiles[0].position.x, 10);
});

test('headless cosmetic impacts cannot evict authoritative hit events from the bounded scoring log', () => {
  const w = new Weapons({ visualEffects: false });
  for (let i = 0; i < 128; i++) w.emit({ type: 'target-hit', projectileId: i });
  for (let i = 0; i < 192; i++) w.impact(new Vec3(i, 0, 0));
  assert.equal(w.drainEvents().filter((e) => e.type === 'target-hit').length, 128);
  assert.equal(w.drainImpacts().length, 128);
  assert.equal(w.drainImpacts().length, 0);
  assert.equal(w.effects.length, 0);
});

test('live projectile history reuses its private vector while published packets stay isolated', () => {
  const { rooms, room, one } = fixture();
  control(rooms, one, { weapon: 'gun', fire: true });
  rooms.step();
  const p = room.combat.weapons.projectiles[0],
    previous = p.previous,
    position = p.position.clone(),
    packet = rooms.snapshot(room);
  rooms.step();
  assert.equal(p.previous, previous);
  assert.deepEqual(p.previous, position);
  assert.notEqual(p.previous, p.position);
  assert.deepEqual(packet.combat.projectiles[0].position, { ...position });
  assert.notDeepEqual(p.position, position);
});
