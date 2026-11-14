import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeSnapshot, decodeSnapshot } from '../src/multiplayer/binarySnapshot.js';
import { expandSnapshot } from '../src/multiplayer/snapshotWire.js';
import { PROJECTILE_LIMIT } from '../src/multiplayer/protocol.js';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import { Vec3 } from '../src/math.js';
import { weaponProfiles } from '../src/weaponDynamics.js';
const tuple = (id) => [
  id,
  'gun',
  'm61',
  'shooter',
  'ally',
  id % 2 ? 'enemy' : null,
  123456.123456789,
  -345.123456789,
  4567.123456789,
  999.123456789,
  2.123456789,
  -3.123456789,
  1.123456789,
  true,
  false,
];
const frame = (n = 3) => ({
  type: 'snapshot',
  round: 2,
  tick: 60,
  time: 0.5,
  combat: {
    ai: null,
    targets: [],
    projectileFormat: 1,
    projectiles: Array.from({ length: n }, (_, i) => tuple(i)),
    events: [],
    eventSequence: 0,
  },
  players: [],
});
test('independent binary frames retain every Float64, identifier and optional field without prior packets', () => {
  const original = frame(PROJECTILE_LIMIT),
    before = structuredClone(original),
    bytes = encodeSnapshot(original);
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.byteLength < Buffer.byteLength(JSON.stringify(original)) * 0.65);
  assert.deepEqual(decodeSnapshot(bytes), expandSnapshot(original));
  assert.deepEqual(original, before);
  const other = frame(1);
  other.combat.projectiles[0][3] = 'new shooter';
  assert.deepEqual(decodeSnapshot(encodeSnapshot(other)), expandSnapshot(other));
});
test('binary decoding respects sliced typed-array byte offsets and allocates independent vectors', () => {
  const f = frame(),
    bytes = encodeSnapshot(f),
    padded = new Uint8Array(bytes.length + 20);
  padded.set(bytes, 7);
  const decoded = decodeSnapshot(padded.subarray(7, 7 + bytes.length));
  assert.deepEqual(decoded, expandSnapshot(f));
  decoded.combat.projectiles[0].position.x = 0;
  assert.notEqual(decodeSnapshot(bytes).combat.projectiles[0].position.x, 0);
  assert.deepEqual(decodeSnapshot(bytes.buffer), expandSnapshot(f));
});
test('malformed binary headers, trailing data, references, flags and nonfinite values are rejected', () => {
  const good = encodeSnapshot(frame(1)),
    bad = [good.subarray(0, 7), good.subarray(0, good.length - 1), new Uint8Array(good.length + 1)];
  const corrupt = (offset, write) => {
    const b = good.slice(),
      v = new DataView(b.buffer);
    write(v, offset);
    bad.push(b);
  };
  corrupt(0, (v, o) => v.setUint32(o, 0, true));
  corrupt(4, (v, o) => v.setUint32(o, 0xffffffff, true));
  const start = 8 + new DataView(good.buffer).getUint32(4, true);
  corrupt(start, (v, o) => v.setFloat64(o, NaN, true));
  corrupt(start + 8, (v, o) => v.setUint16(o, 65535, true));
  corrupt(good.length - 1, (v, o) => v.setUint8(o, 4));
  for (const b of bad) assert.throws(() => decodeSnapshot(b));
  for (const invalid of [null, {}, new Blob([])]) assert.throws(() => decodeSnapshot(invalid));
});
test('welcome, legacy JSON tuples, empty frames and flak without a profile still decode', () => {
  const welcome = { type: 'welcome', players: [] };
  assert.deepEqual(decodeSnapshot(JSON.stringify(welcome)), welcome);
  assert.equal(typeof encodeSnapshot(frame(0)), 'string');
  assert.deepEqual(decodeSnapshot(encodeSnapshot(frame(0))), expandSnapshot(frame(0)));
  const flak = frame(1);
  flak.combat.projectiles[0][1] = 'flak';
  flak.combat.projectiles[0][2] = null;
  assert.deepEqual(decodeSnapshot(encodeSnapshot(flak)), expandSnapshot(flak));
});
test('room packet encoding never borrows mutable state and preserves the program snapshot API', () => {
  const rooms = new MultiplayerRooms(),
    room = rooms.create(),
    p = rooms.join(room, 'f16');
  room.combat.weapons.projectiles.push({
    id: 1,
    type: 'gun',
    profile: weaponProfiles.m61,
    position: new Vec3(1, 2, 3),
    velocity: new Vec3(4, 5, 6),
    age: 0.2,
    sourceId: p.id,
  });
  const expected = JSON.parse(rooms.serialize(room)),
    bytes = rooms.packet(room, null);
  assert.deepEqual(decodeSnapshot(bytes), expected);
  bytes.fill(0);
  assert.deepEqual(JSON.parse(rooms.serialize(room)), expected);
  assert.equal(typeof rooms.serialize(room), 'string');
});
