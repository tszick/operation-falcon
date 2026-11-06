import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import { playerEntity } from '../server/multiplayer-combat.mjs';
import { targetSelectable } from '../src/electronicWarfare.js';
import { neutralAxes, ROOM_CAPACITY } from '../src/multiplayer/protocol.js';
import { Vec3, Quat } from '../src/math.js';
import { applyDamage } from '../src/damage.js';
function setup(count = 5, scenario = 'arena') {
  const rooms = new MultiplayerRooms(),
    room = rooms.create(scenario);
  const pilots = Array.from({ length: count }, (_, i) => rooms.join(room, i % 2 ? 'fa18' : 'f16'));
  return { rooms, room, pilots };
}
function start(rooms, room, pilots) {
  for (const p of pilots)
    assert.equal(
      rooms.preflight(room, p, { type: 'ready', revision: room.lobby.revision, ready: true }),
      null,
    );
  assert.equal(room.mission.phase, 'waiting');
  assert.equal(
    rooms.preflight(room, pilots[0], { type: 'start', revision: room.lobby.revision }),
    null,
  );
}
test('five slots have unique callsigns and only a ready host can start with two to five pilots', () => {
  const { rooms, room, pilots } = setup();
  assert.equal(ROOM_CAPACITY, 5);
  assert.equal(rooms.join(room, 'f16'), null);
  assert.equal(new Set(pilots.map((p) => p.callSign)).size, 5);
  assert.equal(
    rooms.preflight(room, pilots[1], { type: 'start', revision: room.lobby.revision }),
    'not-host',
  );
  assert.equal(
    rooms.preflight(room, pilots[0], { type: 'start', revision: room.lobby.revision }),
    'not-ready',
  );
  start(rooms, room, pilots);
  assert.equal(room.mission.phase, 'active');
  assert.equal(room.combat.targets.length, 0);
  assert.equal(new Set(pilots.map((p) => p.state.team)).size, 5);
  for (const p of pilots) {
    assert.ok(p.state.position.y >= 3000);
    for (const other of pilots.filter((q) => q !== p)) {
      assert.ok(targetSelectable(playerEntity(other), p.state));
      assert.ok(p.state.position.distance(other.state.position) > 8000);
    }
    assert.equal(targetSelectable(playerEntity(p), p.state), false);
  }
});
test('arena victory waits for impact and the authoritative winner cannot change afterwards', () => {
  const { rooms, room, pilots } = setup(3);
  start(rooms, room, pilots);
  pilots[1].state.crashed = true;
  pilots[2].state.dying = true;
  rooms.step();
  assert.equal(room.mission.phase, 'active');
  pilots[2].state.crashed = true;
  rooms.step();
  assert.equal(room.mission.winnerId, pilots[0].id);
  assert.equal(room.mission.reason, 'last-survivor');
  const snapshot = rooms.snapshot(room).mission;
  pilots[0].state.crashed = true;
  rooms.step();
  assert.deepEqual(rooms.snapshot(room).mission, snapshot);
});
test('simultaneous loss is a draw, never an arbitrary insertion-order winner', () => {
  const { rooms, room, pilots } = setup(2);
  start(rooms, room, pilots);
  for (const p of pilots) p.state.crashed = true;
  rooms.step();
  assert.equal(room.mission.reason, 'draw');
  assert.equal(room.mission.winnerId, null);
});
test('arena cannon uses ordinary hit geometry and counts a hostile hit rather than friendly fire', () => {
  const {
    rooms,
    room,
    pilots: [one, two],
  } = setup(2);
  start(rooms, room, [one, two]);
  one.state.position = new Vec3(0, 3000, 0);
  two.state.position = new Vec3(0, 3000, 400);
  for (const p of [one, two]) {
    p.state.orientation = Quat.euler(0, 0, 0);
    p.state.velocity = new Vec3(0, 0, 180);
  }
  for (let i = 0; i < 100; i++) {
    rooms.inputs(one, [
      {
        seq: one.received + 1,
        axes: neutralAxes(),
        toggles: [],
        combat: { weapon: 'gun', fire: true, cycle: false, countermeasures: false },
      },
    ]);
    rooms.step();
  }
  assert.ok(two.state.damage > 0);
  assert.ok(one.combat.hits > 0);
  assert.equal(one.combat.friendlyHits, 0);
  assert.equal(one.state.damage, 0);
});
test('disconnect transfers the same damaged and partially armed aircraft to AI, resume restores exact identity and inventories', () => {
  const {
    rooms,
    room,
    pilots: [one, two],
  } = setup(2);
  start(rooms, room, [one, two]);
  one.state.ammo.aam = 1;
  one.state.ammo.gun = 17;
  applyDamage(one.state, 8, 'leftWing');
  const state = one.state,
    token = one.sessionToken,
    damage = state.damage;
  rooms.leave(room, one);
  assert.equal(one.connected, false);
  assert.equal(room.players.get(one.id), one);
  const position = state.position.clone();
  rooms.step();
  assert.ok(state.position.distance(position) > 0);
  assert.equal(state.ammo.gun, 17);
  assert.equal(state.ammo.aam, 1);
  assert.ok(room.combat.ai.units.some((t) => t.id === one.id));
  assert.equal(rooms.resume(room, 'f'.repeat(64)), null);
  assert.equal(rooms.resume(room, two.sessionToken.slice(1)), null);
  const resumed = rooms.resume(room, token);
  assert.equal(resumed, one);
  assert.equal(resumed.state, state);
  assert.equal(state.damage, damage);
  assert.equal(one.connected, true);
  assert.equal(state.ammo.aam, 1);
  assert.equal(state.ammo.gun, 17);
  assert.equal(
    room.combat.ai.units.some((t) => t.id === one.id),
    false,
  );
  rooms.leave(room, one);
  rooms.step();
  assert.equal(state.ammo.gun, 17);
  assert.ok(!JSON.stringify(rooms.snapshot(room)).includes(token));
});
test('AI takeover can fight other arena pilots with its own remaining weapons and countermeasures', () => {
  const {
    rooms,
    room,
    pilots: [one, two],
  } = setup(2);
  start(rooms, room, [one, two]);
  room.mission.elapsedTicks = 2400;
  one.state.position = new Vec3(0, 3000, 0);
  two.state.position = new Vec3(0, 3000, 4000);
  for (const p of [one, two]) {
    p.state.orientation = Quat.euler(0, 0, 0);
    p.state.velocity = new Vec3(0, 0, 180);
  }
  one.state.ammo.aam = 1;
  rooms.leave(room, one);
  for (let i = 0; i < 1000; i++) rooms.step();
  const launches = room.combat.events.filter(
    (e) => e.type === 'missile-launch' && e.sourceId === one.id,
  );
  assert.ok(launches.length > 0);
  assert.ok(launches.every((e) => e.targetId === two.id));
  assert.equal(one.state.ammo.aam, 0);
});
test('orphan rooms continue AI simulation for the reconnect grace period and are eventually reclaimed', () => {
  let now = 0;
  const rooms = new MultiplayerRooms({ now: () => now, orphanTimeout: 2000 }),
    room = rooms.create('arena');
  const one = rooms.join(room, 'f16'),
    two = rooms.join(room, 'fa18');
  start(rooms, room, [one, two]);
  rooms.leave(room, one);
  rooms.leave(room, two);
  rooms.step();
  assert.ok(rooms.rooms.has(room.code));
  now = 1900;
  assert.equal(rooms.resume(room, one.sessionToken), one);
  rooms.step();
  assert.ok(rooms.rooms.has(room.code));
  rooms.leave(room, one);
  now = 3901;
  rooms.step();
  assert.equal(rooms.rooms.has(room.code), false);
});

test('a sole falling aircraft cannot win until it either survives or impacts', () => {
  const { rooms, room, pilots } = setup(2);
  start(rooms, room, pilots);
  pilots[0].state.crashed = true;
  pilots[1].state.dying = true;
  rooms.step();
  assert.equal(room.mission.phase, 'active');
  pilots[1].state.crashed = true;
  rooms.step();
  assert.equal(room.mission.reason, 'draw');
});

test('AI takeover advances countermeasure timing once per simulation step, exactly like human flight', () => {
  const {
    rooms,
    room,
    pilots: [one, two],
  } = setup(2);
  start(rooms, room, [one, two]);
  rooms.leave(room, one);
  const clock = one.state.countermeasures.clock;
  rooms.step();
  assert.ok(Math.abs(one.state.countermeasures.clock - clock - 1 / 120) < 1e-8);
});

test('human arena pilots can earn a radar lock and hit another pilot with a real missile', () => {
  const {
    rooms,
    room,
    pilots: [one, two],
  } = setup(2);
  start(rooms, room, [one, two]);
  one.state.position = new Vec3(0, 3000, 0);
  two.state.position = new Vec3(0, 3000, 1500);
  for (const p of [one, two]) {
    p.state.orientation = Quat.euler(0, 0, 0);
    p.state.velocity = new Vec3(0, 0, 180);
  }
  const controls = (fire, cycle) => ({
    seq: one.received + 1,
    axes: neutralAxes(),
    toggles: [],
    combat: { weapon: 'aam', fire, cycle, countermeasures: false },
  });
  rooms.inputs(one, [controls(false, true)]);
  rooms.step();
  assert.equal(one.combat.aim.id, two.id);
  for (let i = 0; i < 240; i++) rooms.step();
  assert.equal(one.combat.aim.locked, true);
  rooms.inputs(one, [controls(true, false)]);
  rooms.step();
  assert.ok(
    room.combat.weapons.projectiles.some(
      (p) => p.sourceId === one.id && p.targetEntityId === two.id,
    ),
  );
  assert.equal(one.state.ammo.aam, 1);
  for (let i = 0; i < 960; i++) rooms.step();
  assert.ok(two.state.damage > 0);
  assert.ok(one.combat.hits > 0);
  assert.equal(one.combat.friendlyHits, 0);
});

test('an arena AI substitute cannot leave the fight through the cooperative withdrawal rule', () => {
  const {
    rooms,
    room,
    pilots: [one, two],
  } = setup(2);
  start(rooms, room, [one, two]);
  applyDamage(one.state, 42, 'fuselage');
  rooms.leave(room, one);
  for (let i = 0; i < 30; i++) rooms.step();
  assert.equal(one.actor.retreat, undefined);
  assert.equal(one.actor.exited, undefined);
});
