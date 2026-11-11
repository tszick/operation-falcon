import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SnapshotEncoder,
  SnapshotDecoder,
  inflateSnapshot,
} from '../src/multiplayer/snapshotWire.js';
import { compressSnapshot } from '../server/snapshot-transport.mjs';
import { deflateRawSync } from 'node:zlib';
import { packControlBatch, unpackControlBatch } from '../src/multiplayer/controlWire.js';
import { neutralAxes } from '../src/multiplayer/protocol.js';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';

test('lossless binary deltas preserve numbers, Unicode, removals and changing arrays without mutating history', () => {
  const encoder = new SnapshotEncoder(),
    decoder = new SnapshotDecoder();
  const frame = {
    type: 'snapshot',
    tick: 1,
    nested: { text: 'Árvíztűrő 🛩', value: Math.PI },
    array: [1, 2, 3],
    flag: true,
  };
  const first = decoder.decode(encoder.encode(frame)),
    saved = structuredClone(first);
  for (const update of [
    () => {
      frame.tick++;
      frame.array.length = 2;
      frame.nested.value = Number.MIN_VALUE;
    },
    () => {
      frame.array.push(null, { x: -0, y: 1e100 });
      frame.flag = false;
      delete frame.nested.text;
    },
    () => {
      frame.nested = [];
      frame.extra = { gone: 1 };
    },
    () => {
      frame.nested = { new: [] };
      delete frame.extra;
      frame.array = [];
    },
    () => {},
  ]) {
    update();
    assert.deepEqual(decoder.decode(encoder.encode(frame)), frame);
    assert.deepEqual(first, saved);
  }
  encoder.reset();
  assert.deepEqual(decoder.decode(encoder.encode(frame)), frame);
});

test('missing, corrupt, oversized and truncated frames fail closed', () => {
  const encoder = new SnapshotEncoder(),
    decoder = new SnapshotDecoder();
  const frame = { type: 'snapshot', tick: 0 };
  const initial = encoder.encode(frame);
  decoder.decode(initial);
  frame.tick++;
  encoder.encode(frame);
  frame.tick++;
  assert.throws(() => decoder.decode(encoder.encode(frame)), /Missing snapshot/);
  for (const data of [
    new Uint8Array(),
    initial.slice(0, -1),
    new Uint8Array(300000),
    new Uint8Array([1, 2, 3]),
  ])
    assert.throws(() => new SnapshotDecoder().decode(data));
  assert.throws(() =>
    new SnapshotDecoder().decode(
      new SnapshotEncoder().encode(JSON.parse('{"type":"snapshot","__proto__":{}}')),
    ),
  );
});

test('live five-pilot snapshots reconstruct identically to full JSON through flight, combat and round changes', () => {
  for (const scenario of ['arena', 'cooperative']) {
    const rooms = new MultiplayerRooms(),
      room = rooms.create(scenario),
      decoder = new SnapshotDecoder();
    const pilots = Array.from({ length: 5 }, () => rooms.join(room, 'f16'));
    for (const p of pilots)
      rooms.preflight(room, p, { type: 'ready', revision: room.lobby.revision, ready: true });
    rooms.preflight(room, pilots[0], { type: 'start', revision: room.lobby.revision });
    let total = 0,
      raw = 0;
    for (let i = 0; i < 600; i++) {
      rooms.step();
      if (i % 6) continue;
      const expected = rooms.serialize(room, 0);
      const packet = rooms.wireSnapshot(room, 0, { reset: i === 300 });
      assert.deepEqual(decoder.decode(packet), JSON.parse(expected));
      total += packet.byteLength;
      raw += Buffer.byteLength(expected);
    }
    assert.ok(total < raw * 0.4, 'same state must use substantially fewer bytes');
  }
});

test('shared deflate frames decode losslessly with the browser streaming API and enforce the inflated budget', async () => {
  const encoder = new SnapshotEncoder(),
    decoder = new SnapshotDecoder();
  for (let i = 0; i < 30; i++) {
    const frame = {
      type: 'snapshot',
      tick: i,
      projectiles: Array.from({ length: 100 }, (_, id) => ({
        id,
        x: Math.PI * id + i * 0.1,
        active: true,
      })),
    };
    assert.deepEqual(
      decoder.decode(await inflateSnapshot(compressSnapshot(encoder.encode(frame)))),
      frame,
    );
  }
  await assert.rejects(inflateSnapshot(new Uint8Array([71, 255, 255, 255])));
  const bomb = deflateRawSync(new Uint8Array(300000));
  const packet = new Uint8Array(bomb.length + 1);
  packet[0] = 71;
  packet.set(bomb, 1);
  await assert.rejects(inflateSnapshot(packet), /budget/);
});

test('compact input runs retain every sequence, analog axis, toggle order and combat edge', () => {
  const commands = Array.from({ length: 12 }, (_, i) => ({
    seq: i + 1,
    axes: { ...neutralAxes(), pitch: 0.123456789 },
    toggles: [],
    combat: { weapon: 'gun', fire: true, cycle: false, countermeasures: false },
  }));
  assert.ok(
    JSON.stringify(packControlBatch(commands)).length < JSON.stringify(commands).length * 0.1,
  );
  commands[5].toggles = ['flaps', 'gear'];
  commands[7].combat.cycle = true;
  commands[8].combat = undefined;
  delete commands[8].combat;
  assert.deepEqual(unpackControlBatch(packControlBatch(commands)), commands);
  for (const packed of [
    null,
    [],
    [1],
    [0, [1, 0, 0, 0, 0, 0, [], -1]],
    [1, [100, 0, 0, 0, 0, 0, [], -1]],
    [1, [1, Infinity, 0, 0, 0, 0, [], -1]],
    [1, [1, 0, 0, 0, 0, 0, [99], -1]],
    [1, [1, 0, 0, 0, 0, 2, [], -1]],
  ])
    assert.throws(() => unpackControlBatch(packed));
});
