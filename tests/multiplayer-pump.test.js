import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import { neutralAxes } from '../src/multiplayer/protocol.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerPump } from '../server/multiplayer-pump.mjs';
test('catch-up yields after four steps, retains every physics event and broadcasts only the latest state', () => {
  let clock = 0;
  const events = [],
    packets = [];
  const pump = new MultiplayerPump({
    now: () => clock,
    step: () => events.push(events.length + 1),
    broadcast: () => packets.push([...events]),
  });
  clock = 100;
  let runs = 0;
  do {
    const s = pump.advance();
    assert.ok(s.steps <= 4);
    runs++;
    if (!s.backlog) break;
  } while (runs < 10);
  assert.equal(runs, 3);
  assert.equal(events.length, 12);
  assert.equal(packets.length, 1);
  assert.deepEqual(packets[0], events);
});
test('a slow physics step yields to IO on the time budget without changing the fixed timestep', () => {
  let clock = 0,
    count = 0;
  const pump = new MultiplayerPump({
    now: () => clock,
    step: () => {
      count++;
      clock += 3;
    },
    broadcast: () => {},
  });
  clock = 50;
  const s = pump.advance();
  assert.equal(count, 2);
  assert.equal(s.backlog, true);
  assert.equal(s.droppedMs, 0);
});
test('normal cadence emits one state per six steps and reset cannot carry a previous room backlog', () => {
  let clock = 0,
    steps = 0,
    packets = 0;
  const pump = new MultiplayerPump({
    now: () => clock,
    step: () => steps++,
    broadcast: () => packets++,
  });
  for (let i = 0; i < 60; i++) {
    clock += 10;
    while (pump.advance().backlog) {
      // Drain the bounded catch-up chunks at the same test clock.
    }
  }
  assert.equal(steps, 72);
  assert.equal(packets, 12);
  clock += 700;
  const stalled = pump.advance();
  assert.ok(stalled.droppedMs > 599);
  pump.reset();
  assert.equal(pump.advance().steps, 0);
});

test('coalesced catch-up packets retain native gun events and acknowledge every queued command', () => {
  const rooms = new MultiplayerRooms(),
    room = rooms.create(),
    p = rooms.join(room, 'f16');
  const ammo = p.state.ammo.gun;
  rooms.inputs(
    p,
    Array.from({ length: 12 }, (_, i) => ({
      seq: i + 1,
      axes: neutralAxes(),
      toggles: [],
      combat: { weapon: 'gun', fire: true, cycle: false, countermeasures: false },
    })),
  );
  let clock = 0;
  const packets = [],
    pump = new MultiplayerPump({
      now: () => clock,
      step: () => rooms.step(),
      broadcast: () => packets.push(JSON.parse(rooms.serialize(room))),
    });
  clock = 100;
  while (pump.advance().backlog) {
    // Drain the bounded catch-up chunks at the same test clock.
  }
  assert.equal(room.tick, 12);
  assert.equal(p.ack, 12);
  assert.ok(p.state.ammo.gun < ammo);
  assert.equal(packets.length, 1);
  assert.equal(packets[0].tick, 12);
  assert.ok(
    packets[0].combat.events.some(
      (e) => e.type === 'gun' && e.sourceId === p.id && e.time < packets[0].time,
    ),
  );
});
