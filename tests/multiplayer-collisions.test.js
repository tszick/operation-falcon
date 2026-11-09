import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import { Vec3, Quat } from '../src/math.js';
import { stepRoomCombat } from '../server/multiplayer-combat.mjs';
import { NETWORK_STEP } from '../src/multiplayer/protocol.js';
function setup() {
  const rooms = new MultiplayerRooms();
  const room = rooms.create('range');
  const one = rooms.join(room, 'f16');
  const two = rooms.join(room, 'fa18');
  room.combat.targets = [];
  for (const p of [one, two])
    Object.assign(p.state, {
      position: new Vec3(0, 3000, 0),
      previousPosition: new Vec3(0, 3000, 0),
      velocity: new Vec3(0, 0, 200),
      orientation: new Quat(),
      previousOrientation: new Quat(),
      onGround: false,
      airborne: true,
    });
  return { rooms, room, one, two };
}
test('server resolves swept player collisions for both teams and disconnected pilots once', () => {
  for (const enemy of [false, true])
    for (const connected of [false, true]) {
      const { rooms, room, one, two } = setup();
      two.connected = connected;
      two.state.team = enemy ? 'enemy' : 'ally';
      one.state.previousPosition.z = -80;
      one.state.position.z = 80;
      stepRoomCombat(room, new Map(), NETWORK_STEP);
      assert.equal(one.state.dying, true);
      assert.equal(two.state.dying, true);
      assert.equal(one.state.crashed, false, 'fatal collision still plays the fall');
      const events = room.combat.events.filter((e) => e.type === 'collision');
      assert.equal(events.length, 1);
      assert.deepEqual(
        new Set([events[0].sourceId, events[0].targetId]),
        new Set([one.id, two.id]),
      );
      assert.equal(typeof events[0].relativeSpeedMps, 'number');
      assert.equal(one.combat.kills + two.combat.kills, 0);
      stepRoomCombat(room, new Map(), NETWORK_STEP);
      assert.equal(room.combat.events.filter((e) => e.type === 'collision').length, 1);
      const snapshot = rooms.snapshot(room);
      assert.equal(
        snapshot.players.every((p) => p.state.dying),
        true,
      );
    }
});
test('near miss does not damage either pilot and preflight does not simulate collision', () => {
  const { room, one, two } = setup();
  one.state.previousPosition.z = -80;
  one.state.position.z = 80;
  two.state.position.x = two.state.previousPosition.x = 100;
  stepRoomCombat(room, new Map(), NETWORK_STEP);
  assert.equal(one.state.dying, false);
  assert.equal(two.state.dying, false);
  assert.equal(
    room.combat.events.some((e) => e.type === 'collision'),
    false,
  );
  const rooms = new MultiplayerRooms();
  const lobby = rooms.create('cooperative');
  const a = rooms.join(lobby, 'f16'),
    b = rooms.join(lobby, 'f16');
  b.state.position = a.state.position.clone();
  rooms.step();
  assert.equal(a.state.dying, false);
  assert.equal(b.state.dying, false);
});
