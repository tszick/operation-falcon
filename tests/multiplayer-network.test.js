import { Vec3, Quat } from '../src/math.js';
import { NetworkCombatView } from '../src/multiplayer/combatView.js';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { createStaticServer } from '../server/static-server.mjs';
import { attachMultiplayer } from '../server/multiplayer-server.mjs';
import { MultiplayerClient } from '../src/multiplayer/client.js';
import { SnapshotInbox } from '../src/multiplayer/snapshotInbox.js';
import { EVENT_LIMIT, NETWORK_STEP, neutralAxes } from '../src/multiplayer/protocol.js';
import { LocalNetworkLink, memorySession } from './helpers/local-network.mjs';
async function fixture(t) {
  const server = createStaticServer({ root: process.cwd() }),
    multiplayer = attachMultiplayer(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    multiplayer.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return { origin: 'http://127.0.0.1:' + server.address().port, multiplayer };
}
async function connect(t, f, hello, profile = {}, storage = memorySession(), clientOptions = {}) {
  let resolve, reject;
  const welcome = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const timeout = setTimeout(() => reject(new Error('Welcome timeout')), 6000);
  const errors = [];
  const client = new MultiplayerClient({
    ...clientOptions,
    baseUrl: f.origin,
    getStorage: () => storage,
    socketFactory: (url) => new LocalNetworkLink(url, f.origin, profile),
    onWelcome: (msg) => {
      clearTimeout(timeout);
      resolve(msg);
    },
    onStatus: (error) => errors.push(error),
  });
  t.after(() => {
    clearTimeout(timeout);
    client.socket?.terminate();
  });
  client.connect({ aircraftId: 'f16', ...hello });
  await welcome;
  return { client, storage, errors };
}
function drive(t, entries) {
  let last = performance.now(),
    accumulator = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    accumulator += Math.min(0.05, (now - last) / 1000);
    last = now;
    while (accumulator >= NETWORK_STEP) {
      for (const { client } of entries)
        if (client.socket.readyState === 1 && !client.stale)
          client.prediction.step({ ...neutralAxes(), roll: 0.015 }, [], undefined);
      accumulator -= NETWORK_STEP;
    }
  }, 8);
  t.after(() => clearInterval(timer));
  return () => clearInterval(timer);
}
test('a burst applies only the newest state while retaining one-shot combat events in order', () => {
  const tasks = [],
    applied = [],
    inbox = new SnapshotInbox(
      (...args) => applied.push(args),
      (task) => tasks.push(task),
    );
  for (let tick = 1; tick <= 20; tick++)
    inbox.offer(
      { tick, combat: { events: [{ id: tick, type: 'explosion' }], eventSequence: tick } },
      tick * 50,
    );
  assert.equal(tasks.length, 1);
  assert.equal(inbox.coalesced, 19);
  tasks.shift()();
  assert.equal(applied.length, 1);
  assert.equal(applied[0][0].tick, 20);
  assert.deepEqual(
    applied[0][0].combat.events.map((e) => e.id),
    Array.from({ length: 20 }, (_, i) => i + 1),
  );
  assert.equal(applied[0][1], 1000);
  inbox.offer({ tick: 21, combat: { events: [{ id: 21 }], eventSequence: 21 } }, 1050);
  inbox.clear();
  tasks.shift()();
  assert.equal(applied.length, 1);
});
test('burst history is bounded without retaining unbounded snapshots or altering packet objects', () => {
  const tasks = [],
    inbox = new SnapshotInbox(
      () => {},
      (task) => tasks.push(task),
    );
  const original = { tick: 0, combat: { events: [{ id: 0 }], eventSequence: 0 } };
  inbox.offer(original, 0);
  for (let id = 1; id < 500; id++)
    inbox.offer({ tick: id, combat: { events: [{ id }], eventSequence: id } }, id);
  assert.equal(inbox.events.size, EVENT_LIMIT);
  assert.equal(inbox.pending.snapshot.tick, 499);
  assert.deepEqual(original.combat.events, [{ id: 0 }]);
  assert.equal(tasks.length, 1);
});
test(
  'five real localhost clients tolerate delay, jitter and a downlink burst, then resume an AI aircraft',
  { timeout: 20000 },
  async (t) => {
    const f = await fixture(t),
      entries = [];
    let holdUntil = 0;
    entries.push(await connect(t, f, { mode: 'create' }, {}));
    for (const latency of [40, 80, 120, 160])
      entries.push(
        await connect(
          t,
          f,
          { mode: 'join', code: entries[0].client.code },
          { latency, jitter: 15, holdDown: () => holdUntil },
        ),
      );
    const room = f.multiplayer.rooms.rooms.get(entries[0].client.code);
    assert.equal(room.players.size, 5);
    const stop = drive(t, entries);
    await sleep(450);
    holdUntil = performance.now() + 1200;
    await sleep(950);
    assert.ok(entries.some(({ client }) => client.stale));
    await sleep(650);
    assert.ok(entries.some((e) => e.client.inbox.coalesced > 0));
    for (const { client, errors } of entries) {
      assert.deepEqual(errors, []);
      assert.equal(client.socket.readyState, 1);
      assert.ok(client.prediction.pending.length <= 120);
      assert.ok(client.history.frames.length <= 32);
      assert.ok(client.combat.frames.length <= 8);
      assert.ok(Number.isFinite(client.prediction.state.position.y));
    }
    const old = entries[2],
      id = old.client.id,
      pilot = room.players.get(id);
    pilot.state.ammo.aam = 1;
    const closed = once(old.client.socket.raw, 'close');
    old.client.disconnect();
    await closed;
    for (let i = 0; i < 50 && pilot.connected; i++) await sleep(10);
    assert.equal(pilot.connected, false);
    assert.equal(pilot.actor.aiControlled, true);
    await sleep(150);
    const returning = await connect(
      t,
      f,
      { mode: 'join', code: room.code },
      { latency: 80, jitter: 10 },
      old.storage,
    );
    entries[2] = returning;
    assert.equal(returning.client.id, id);
    assert.equal(returning.client.prediction.state.ammo.aam, 1);
    assert.equal(room.players.size, 5);
    assert.equal(pilot.connected, true);
    await sleep(1000);
    stop();
    await until(() => entries.every((e) => e.client.prediction.pending.length === 0));
    for (const { client, errors } of entries) {
      assert.deepEqual(errors, []);
      assert.equal(client.socket.readyState, 1);
      assert.equal(client.prediction.pending.length, 0);
      const serverPilot = room.players.get(client.id);
      assert.ok(client.prediction.state.position.distance(serverPilot.state.position) < 120);
      assert.ok(client.metrics.maxCorrectionM < 500);
    }
    t.diagnostic(
      JSON.stringify(
        entries.map(({ client }) => ({
          delayMs: client.socket.profile.latency,
          coalesced: client.inbox.coalesced,
          maxReconcileMs: Math.round(client.metrics.maxReconcileMs * 100) / 100,
          maxCorrectionM: Math.round(client.metrics.maxCorrectionM),
          downKB: Math.round(client.socket.receivedBytes / 1024),
        })),
      ),
    );
  },
);

test('the lobby template provides every named preflight binding, including arena briefing and host start', () => {
  const html = readFileSync(new URL('../multiplayer.html', import.meta.url), 'utf8');
  for (const binding of [
    'mission',
    'mission-label',
    'briefing',
    'role',
    'roster',
    'code',
    'aircraft',
    'fuel',
    'gun',
    'stations',
    'equipment',
    'mass',
    'unsaved',
    'save',
    'ready',
    'start',
    'notice',
    'leave',
  ])
    assert.ok(html.includes('data-preflight="' + binding + '"'), binding);
});

test('a one-shot explosion in a replaced snapshot still renders exactly once', () => {
  const view = new NetworkCombatView(),
    tasks = [];
  view.accept(
    { tick: 0, time: 0, combat: { events: [], eventSequence: 0, targets: [], projectiles: [] } },
    true,
  );
  const inbox = new SnapshotInbox(
    (snapshot) => view.accept(snapshot),
    (task) => tasks.push(task),
  );
  inbox.offer(
    {
      tick: 6,
      time: 0.05,
      combat: {
        eventSequence: 1,
        events: [{ id: 1, type: 'explosion', time: 0.05, position: { x: 1, y: 2, z: 3 } }],
        targets: [],
        projectiles: [],
      },
    },
    50,
  );
  inbox.offer(
    { tick: 12, time: 0.1, combat: { eventSequence: 1, events: [], targets: [], projectiles: [] } },
    100,
  );
  tasks.shift()();
  assert.equal(view.effects.length, 1);
  assert.equal(view.sample(0.1).effects.length, 1);
  inbox.offer(
    {
      tick: 18,
      time: 0.15,
      combat: {
        eventSequence: 1,
        events: [{ id: 1, type: 'explosion', time: 0.05, position: { x: 1, y: 2, z: 3 } }],
        targets: [],
        projectiles: [],
      },
    },
    150,
  );
  tasks.shift()();
  assert.equal(view.effects.length, 1);
});

test(
  'an absent pilot can join a later lobby with an expired session as a new participant',
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t),
      a = await connect(t, f, { mode: 'create', scenario: 'arena' }),
      b = await connect(t, f, { mode: 'join', code: a.client.code });
    const room = f.multiplayer.rooms.rooms.get(a.client.code),
      rooms = f.multiplayer.rooms;
    for (const p of room.players.values())
      rooms.preflight(room, p, { type: 'ready', revision: room.lobby.revision, ready: true });
    rooms.preflight(room, room.players.get(a.client.id), {
      type: 'start',
      revision: room.lobby.revision,
    });
    const oldId = b.client.id,
      closed = once(b.client.socket.raw, 'close');
    b.client.disconnect();
    await closed;
    for (let i = 0; i < 50 && room.players.get(oldId).connected; i++) await sleep(10);
    room.players.get(oldId).state.crashed = true;
    rooms.step();
    rooms.preflight(room, room.players.get(a.client.id), {
      type: 'rematch',
      revision: room.lobby.revision,
    });
    const fresh = await connect(t, f, { mode: 'join', code: room.code }, {}, b.storage);
    assert.notEqual(fresh.client.id, oldId);
    assert.deepEqual(fresh.errors, []);
    assert.equal(fresh.client.latest.mission.phase, 'waiting');
    assert.equal(room.players.size, 2);
  },
);

async function until(predicate, timeout = 4000) {
  const deadline = performance.now() + timeout;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error('Local multiplayer condition timed out');
    await sleep(10);
  }
}

test(
  'five localhost pilots complete four rounds with AI takeover, same-client recovery and host migration',
  { timeout: 20000 },
  async (t) => {
    const f = await fixture(t),
      entries = [await connect(t, f, { mode: 'create', scenario: 'arena' })];
    for (let i = 0; i < 4; i++)
      entries.push(await connect(t, f, { mode: 'join', code: entries[0].client.code }));
    const room = f.multiplayer.rooms.rooms.get(entries[0].client.code),
      code = room.code;
    const ids = entries.map((e) => e.client.id);
    for (let round = 1; round <= 4; round++) {
      await until(() =>
        entries.every(
          (e) =>
            e.client.latest?.round === round &&
            e.client.latest.lobby.revision === room.lobby.revision,
        ),
      );
      for (const { client } of entries)
        client.send({ type: 'ready', revision: room.lobby.revision, ready: true });
      await until(() => [...room.players.values()].every((p) => p.ready));
      const host = entries.find((e) => e.client.id === room.lobby.hostId);
      host.client.send({ type: 'start', revision: room.lobby.revision });
      await until(() => entries.every((e) => e.client.latest.mission.phase === 'active'));
      const returning = entries[(round - 1) % entries.length],
        oldId = returning.client.id;
      room.players.get(oldId).state.ammo.aam = 1;
      const closed = once(returning.client.socket.raw, 'close');
      returning.client.socket.terminate();
      await closed;
      await until(() => !room.players.get(oldId).connected);
      await sleep(60);
      assert.equal(room.players.get(oldId).actor.aiControlled, true);
      const resumed = new Promise((resolve) => {
        returning.client.onWelcome = resolve;
      });
      returning.client.connect({ mode: 'join', code, aircraftId: 'f16' });
      await resumed;
      assert.equal(returning.client.id, oldId);
      assert.equal(returning.client.round, round);
      assert.equal(returning.client.prediction.state.ammo.aam, 1);
      assert.equal(returning.client.prediction.pending.length, 0);
      returning.client.prediction.step(neutralAxes());
      returning.client.flush();
      await until(() => room.players.get(oldId).ack === 1);
      for (const p of [...room.players.values()].slice(1)) p.state.crashed = true;
      await until(() => entries.every((e) => e.client.latest.mission.phase === 'success'));
      assert.deepEqual(
        entries.map((e) => e.client.latest.mission),
        Array(5).fill(entries[0].client.latest.mission),
      );
      if (round < 4) {
        entries
          .find((e) => e.client.id === room.lobby.hostId)
          .client.send({ type: 'rematch', revision: room.lobby.revision });
        await until(() => entries.every((e) => e.client.latest.round === round + 1));
        assert.ok(
          [...room.players.values()].every(
            (p) => !p.state.crashed && !p.ready && p.state.damage === 0,
          ),
        );
      }
      assert.equal(room.code, code);
      assert.deepEqual([...room.players.keys()], ids);
      for (const e of entries) {
        assert.equal(e.client.socket.readyState, 1);
        assert.deepEqual(e.errors, []);
        assert.ok(e.client.history.frames.length <= 32);
        assert.ok(e.client.combat.frames.length <= 8);
      }
    }
  },
);

test(
  'an expired recovery token cannot create a replacement aircraft in an active localhost round',
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t),
      a = await connect(t, f, { mode: 'create', scenario: 'arena' });
    await connect(t, f, { mode: 'join', code: a.client.code });
    const rooms = f.multiplayer.rooms,
      room = rooms.rooms.get(a.client.code);
    for (const p of room.players.values())
      rooms.preflight(room, p, { type: 'ready', revision: room.lobby.revision, ready: true });
    rooms.preflight(room, room.players.get(a.client.id), {
      type: 'start',
      revision: room.lobby.revision,
    });
    const storage = memorySession(),
      errors = [];
    storage.setItem('falcon-session:' + room.code, 'a'.repeat(64));
    let welcomed = false;
    const outsider = new MultiplayerClient({
      baseUrl: f.origin,
      getStorage: () => storage,
      socketFactory: (url) => new LocalNetworkLink(url, f.origin),
      onStatus: (code) => errors.push(code),
      onWelcome: () => {
        welcomed = true;
      },
    });
    t.after(() => outsider.socket.terminate());
    outsider.connect({ mode: 'join', code: room.code, aircraftId: 'f16' });
    await until(() => errors.length > 0);
    assert.deepEqual(errors, ['room-started']);
    assert.equal(welcomed, false);
    assert.equal(room.players.size, 2);
    assert.equal(room.mission.phase, 'active');
    assert.equal(storage.getItem('falcon-session:' + room.code), null);
  },
);

test(
  'real localhost transport loss automatically returns the same pilot from AI without refilling',
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t),
      a = await connect(t, f, { mode: 'create', scenario: 'arena' });
    const b = await connect(t, f, { mode: 'join', code: a.client.code }, {}, memorySession(), {
      reconnectDelays: [100, 200, 400],
    });
    const rooms = f.multiplayer.rooms,
      room = rooms.rooms.get(a.client.code);
    for (const p of room.players.values())
      rooms.preflight(room, p, { type: 'ready', revision: room.lobby.revision, ready: true });
    rooms.preflight(room, room.players.get(a.client.id), {
      type: 'start',
      revision: room.lobby.revision,
    });
    await until(() => b.client.latest.mission.phase === 'active');
    const id = b.client.id,
      pilot = room.players.get(id);
    pilot.state.ammo.aam = 1;
    const fuel = pilot.state.fuel;
    const resumed = new Promise((resolve) => {
      b.client.onWelcome = resolve;
    });
    b.client.socket.terminate();
    await until(() => !pilot.connected);
    await until(() => pilot.actor.aiControlled);
    const msg = await resumed;
    assert.equal(msg.resumed, true);
    assert.equal(b.client.id, id);
    assert.equal(pilot.connected, true);
    assert.equal(pilot.actor.aiControlled, false);
    assert.equal(room.players.size, 2);
    assert.equal(b.client.prediction.state.ammo.aam, 1);
    assert.ok(b.client.prediction.state.fuel <= fuel);
    assert.equal(b.client.recovering, false);
    assert.deepEqual(b.errors, []);
    b.client.prediction.step(neutralAxes());
    b.client.flush();
    await until(() => pilot.ack === 1);
    b.client.disconnect();
  },
);

test(
  'a long localhost uplink stall drains controls within the authoritative queue limit without gaps',
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t);
    let held = 0;
    const entry = await connect(t, f, { mode: 'create' }, { holdUp: () => held }),
      client = entry.client;
    const stop = drive(t, [entry]);
    held = performance.now() + 950;
    await sleep(750);
    assert.equal(client.socket.readyState, 1);
    assert.ok(client.prediction.pending.length <= 120);
    await sleep(1700);
    stop();
    await until(() => client.prediction.pending.length === 0);
    assert.equal(client.socket.readyState, 1);
    assert.deepEqual(entry.errors, []);
    const pilot = f.multiplayer.rooms.rooms.get(client.code).players.get(client.id);
    assert.equal(pilot.ack, client.prediction.sequence);
    assert.equal(client.prediction.outgoing.length, 0);
  },
);

test(
  'delayed real localhost pilots see the same lock, missile hit and authoritative damage',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t),
      a = await connect(t, f, { mode: 'create', scenario: 'arena' }, { latency: 80, jitter: 12 });
    const b = await connect(
      t,
      f,
      { mode: 'join', code: a.client.code },
      { latency: 120, jitter: 18 },
    );
    const rooms = f.multiplayer.rooms,
      room = rooms.rooms.get(a.client.code);
    for (const p of room.players.values())
      rooms.preflight(room, p, { type: 'ready', revision: room.lobby.revision, ready: true });
    rooms.preflight(room, room.players.get(a.client.id), {
      type: 'start',
      revision: room.lobby.revision,
    });
    const shooter = room.players.get(a.client.id),
      target = room.players.get(b.client.id);
    for (const [p, z] of [
      [shooter, 0],
      [target, 1500],
    ]) {
      p.state.position = new Vec3(0, 3000, z);
      p.state.previousPosition = p.state.position.clone();
      p.state.orientation = Quat.euler(0, 0, 0);
      p.state.velocity = new Vec3(0, 0, 180);
    }
    const events = [new Map(), new Map()];
    [a, b].forEach((e, i) => {
      e.client.onSnapshot = (s) => {
        for (const event of s.combat.events) events[i].set(event.id, event);
      };
    });
    await until(() => [a, b].every((e) => e.client.latest.mission.phase === 'active'));
    let first = true,
      fire = false,
      last = performance.now(),
      accumulator = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      accumulator += Math.min(0.05, (now - last) / 1000);
      last = now;
      while (accumulator >= NETWORK_STEP) {
        for (const [i, e] of [a, b].entries()) {
          const stepped = e.client.prediction.step(neutralAxes(), [], {
            weapon: 'aam',
            fire: i === 0 && fire,
            cycle: i === 0 && first,
            countermeasures: false,
          });
          if (i === 0 && stepped) first = false;
        }
        accumulator -= NETWORK_STEP;
      }
    }, 8);
    t.after(() => clearInterval(timer));
    await until(() => a.client.latest.players.find((p) => p.id === a.client.id).combat.aim.locked);
    fire = true;
    await until(() => shooter.state.ammo.aam === 1);
    fire = false;
    await until(
      () =>
        events.every((list) =>
          [...list.values()].some(
            (e) =>
              e.type === 'target-hit' && e.sourceId === a.client.id && e.targetId === b.client.id,
          ),
        ),
      8000,
    );
    clearInterval(timer);
    assert.equal(target.state.damage > 0, true);
    assert.equal(shooter.combat.hits, 1);
    assert.equal(shooter.combat.friendlyHits, 0);
    const hitIds = events.map((list) =>
      [...list.values()]
        .filter((e) => e.type === 'target-hit' && e.sourceId === a.client.id)
        .map((e) => e.id),
    );
    assert.deepEqual(hitIds[0], hitIds[1]);
    assert.equal(a.client.socket.readyState, 1);
    assert.equal(b.client.socket.readyState, 1);
    assert.deepEqual(a.errors, []);
    assert.deepEqual(b.errors, []);
  },
);
