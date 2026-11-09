import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { MultiplayerClient } from '../src/multiplayer/client.js';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import { PROTOCOL_VERSION, neutralAxes, INPUT_QUEUE_LIMIT } from '../src/multiplayer/protocol.js';
import { memorySession } from './helpers/local-network.mjs';
class Socket {
  readyState = 0;
  bufferedAmount = 0;
  listeners = new Map();
  messages = [];
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  emit(type, event = {}) {
    for (const cb of this.listeners.get(type) || []) cb(event);
  }
  send(value) {
    this.messages.push(JSON.parse(value));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.emit('open');
  }
  message(value) {
    this.emit('message', { data: JSON.stringify(value) });
  }
}
function setup(t, options = {}) {
  const sockets = [],
    statuses = [],
    storage = memorySession();
  let closed = 0;
  const client = new MultiplayerClient({
    baseUrl: 'http://127.0.0.1:5174',
    getStorage: () => storage,
    socketFactory: () => {
      const s = new Socket();
      sockets.push(s);
      return s;
    },
    onStatus: (s) => statuses.push(s),
    onClose: () => closed++,
    ...options,
  });
  t.after(() => client.stopConnectionTimers());
  return { client, sockets, statuses, storage, closed: () => closed };
}
function welcome() {
  const rooms = new MultiplayerRooms(),
    room = rooms.create('arena'),
    p = rooms.join(room, 'f16');
  return {
    ...rooms.snapshot(room),
    type: 'welcome',
    version: PROTOCOL_VERSION,
    id: p.id,
    code: room.code,
    sessionToken: p.sessionToken,
  };
}
test('a silent connection times out during opening or while awaiting the welcome packet', async (t) => {
  for (const opened of [false, true]) {
    const f = setup(t, { connectionTimeoutMs: 20 });
    f.client.connect({ mode: 'create', aircraftId: 'f16' });
    if (opened) f.sockets[0].open();
    await sleep(45);
    assert.deepEqual(f.statuses, ['connection-timeout']);
    assert.equal(f.sockets[0].readyState, 3);
    f.sockets[0].emit('close');
    assert.equal(f.closed(), 1);
  }
});
test('a successful welcome cancels the deadline and stores the private recovery session', async (t) => {
  const f = setup(t, { connectionTimeoutMs: 20 }),
    msg = welcome();
  f.client.connect({ mode: 'create', aircraftId: 'f16' });
  f.sockets[0].open();
  f.sockets[0].message(msg);
  await sleep(45);
  assert.deepEqual(f.statuses, []);
  assert.equal(f.sockets[0].readyState, 1);
  assert.equal(f.storage.getItem('falcon-session:' + msg.code), msg.sessionToken);
});
test('old socket callbacks cannot close, identify or overwrite a replacement connection', (t) => {
  const f = setup(t),
    oldWelcome = welcome(),
    freshWelcome = welcome();
  f.client.connect({ mode: 'create', aircraftId: 'f16' });
  const old = f.sockets[0];
  old.open();
  old.message(oldWelcome);
  f.client.round = 7;
  f.client.prediction.step(neutralAxes());
  f.client.connect({ mode: 'create', aircraftId: 'f16' });
  const fresh = f.sockets[1];
  fresh.open();
  fresh.message(freshWelcome);
  old.emit('close');
  old.emit('error');
  old.emit('open');
  old.message(oldWelcome);
  assert.equal(f.closed(), 0);
  assert.deepEqual(f.statuses, []);
  assert.equal(f.client.id, freshWelcome.id);
  assert.equal(f.client.latest.code, freshWelcome.code);
  assert.equal(f.client.round, 1);
  assert.equal(f.client.prediction.pending.length, 0);
  assert.equal(f.client.prediction.outgoing.length, 0);
  assert.equal(f.client.history.frames.length, 1);
  assert.equal(fresh.readyState, 1);
  assert.equal(fresh.messages.length, 1);
});

async function until(predicate) {
  const deadline = performance.now() + 2000;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error('Recovery timed out');
    await sleep(5);
  }
}
function drop(socket, code = 1006) {
  socket.close();
  socket.emit('close', { code });
}
test('automatic recovery reuses only the private session even without browser storage', async (t) => {
  const attempts = [],
    f = setup(t, {
      reconnectDelays: [5, 10, 20],
      onReconnecting: (a) => attempts.push(a),
      getStorage: () => {
        throw new Error('Storage disabled');
      },
    }),
    msg = welcome();
  f.client.connect({ mode: 'create', aircraftId: 'f16' });
  f.sockets[0].open();
  f.sockets[0].message(msg);
  drop(f.sockets[0]);
  assert.equal(f.closed(), 0);
  assert.equal(f.client.recovering, true);
  await until(() => f.sockets.length === 2);
  f.sockets[1].open();
  assert.equal(f.sockets[1].messages[0].mode, 'join');
  assert.equal(f.sockets[1].messages[0].code, msg.code);
  assert.equal(f.sockets[1].messages[0].resumeToken, msg.sessionToken);
  f.sockets[1].message({ ...msg, resumed: true });
  assert.equal(f.client.recovering, false);
  assert.equal(f.client.reconnectAttempt, 0);
  assert.equal(attempts.length, 1);
});
test('recovery stops after three failed attempts and permits a later manual connection', async (t) => {
  const attempts = [],
    f = setup(t, { reconnectDelays: [5, 5, 5], onReconnecting: (a) => attempts.push(a) });
  f.client.connect({ mode: 'create', aircraftId: 'f16' });
  f.sockets[0].open();
  f.sockets[0].message(welcome());
  drop(f.sockets[0]);
  for (let i = 1; i <= 3; i++) {
    await until(() => f.sockets.length === i + 1);
    f.sockets[i].open();
    f.sockets[i].emit('error');
    drop(f.sockets[i]);
  }
  assert.equal(f.closed(), 1);
  assert.deepEqual(
    attempts.map((a) => a.attempt),
    [1, 2, 3],
  );
  assert.equal(f.client.recovering, false);
  assert.deepEqual(f.statuses, []);
  f.client.connect({ mode: 'create', aircraftId: 'f16' });
  f.sockets[4].open();
  f.sockets[4].message(welcome());
  assert.equal(f.client.reconnectAttempt, 0);
});
test('intentional departure cancels a pending recovery without another socket', async (t) => {
  const f = setup(t, { reconnectDelays: [30] });
  f.client.connect({ mode: 'create', aircraftId: 'f16' });
  f.sockets[0].open();
  f.sockets[0].message(welcome());
  drop(f.sockets[0]);
  f.client.disconnect();
  await sleep(50);
  assert.equal(f.sockets.length, 1);
  assert.equal(f.closed(), 1);
  assert.equal(f.client.recovering, false);
});
test('a rejected recovery never falls back to a fresh aircraft or another automatic join', async (t) => {
  const f = setup(t, { reconnectDelays: [5, 5] });
  f.client.connect({ mode: 'create', aircraftId: 'f16' });
  f.sockets[0].open();
  f.sockets[0].message(welcome());
  drop(f.sockets[0]);
  await until(() => f.sockets.length === 2);
  const s = f.sockets[1];
  s.open();
  s.message({ type: 'error', code: 'session-invalid' });
  s.emit('close', { code: 1000 });
  await sleep(25);
  assert.deepEqual(f.statuses, ['session-invalid']);
  assert.equal(s.messages.length, 1);
  assert.equal(f.sockets.length, 2);
  assert.equal(f.closed(), 1);
});
test('displaced sessions and policy rejections cannot start a reconnect tug of war', (t) => {
  for (const code of [1000, 1008]) {
    const f = setup(t, { reconnectDelays: [5] });
    f.client.connect({ mode: 'create', aircraftId: 'f16' });
    f.sockets[0].open();
    f.sockets[0].message(welcome());
    drop(f.sockets[0], code);
    assert.equal(f.closed(), 1);
    assert.equal(f.client.reconnectTimer, null);
  }
});

test('a control backlog preserves ordered unsent inputs until acknowledgements free server capacity', (t) => {
  const f = setup(t),
    msg = welcome();
  f.client.connect({ mode: 'create', aircraftId: 'f16' });
  const socket = f.sockets[0];
  socket.open();
  socket.message(msg);
  f.client.prediction.simulating = true;
  // Queue a long real prediction backlog, as after a delayed browser frame.
  for (let i = 0; i < 120; i++) f.client.prediction.step(neutralAxes());
  socket.bufferedAmount = 9000;
  f.client.flush();
  assert.equal(f.client.prediction.outgoing.length, 120);
  socket.bufferedAmount = 0;
  f.client.flush();
  let commands = socket.messages.filter((m) => m.type === 'input').flatMap((m) => m.commands);
  assert.equal(commands.length, INPUT_QUEUE_LIMIT);
  assert.equal(f.client.prediction.outgoing[0].seq, INPUT_QUEUE_LIMIT + 1);
  f.client.prediction.acknowledged = INPUT_QUEUE_LIMIT;
  f.client.flush();
  f.client.prediction.acknowledged = INPUT_QUEUE_LIMIT * 2;
  f.client.flush();
  commands = socket.messages.filter((m) => m.type === 'input').flatMap((m) => m.commands);
  assert.deepEqual(
    commands.map((c) => c.seq),
    Array.from({ length: 120 }, (_, i) => i + 1),
  );
  assert.equal(f.client.prediction.outgoing.length, 0);
});

// A rejected packet must not replace the last trusted world or snapshot.
test('invalid terrain is counted and closes the connection without applying the packet', (t) => {
  const f = setup(t),
    msg = welcome();
  f.client.connect({ mode: 'create', aircraftId: 'f16' });
  const socket = f.sockets[0];
  socket.open();
  socket.message(msg);
  const previous = f.client.latest;
  socket.message({ type: 'snapshot', world: { revision: 'invalid' } });
  assert.equal(socket.readyState, 3);
  assert.equal(f.client.metrics.decodeFailures, 1);
  assert.equal(f.client.metrics.lastDecodeError, 'Invalid terrain number');
  assert.equal(f.client.latest, previous);
});
