import { decodeSnapshot } from '../src/multiplayer/binarySnapshot.js';
import { expandSnapshot } from '../src/multiplayer/snapshotWire.js';
import { defaultSelection } from '../src/multiplayer/preflight.js';
import { applyDamage } from '../src/damage.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createStaticServer } from '../server/static-server.mjs';
import { attachMultiplayer } from '../server/multiplayer-server.mjs';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import { sameOriginRequest, allowedHost } from '../server/request-policy.mjs';
import {
  PROTOCOL_VERSION,
  neutralAxes,
  validCommand,
  validRoomCode,
  NETWORK_STEP,
  normalizePlayerName,
} from '../src/multiplayer/protocol.js';
import {
  packFlight,
  unpackFlight,
  applyFlightCommand,
  interpolateOrientation,
} from '../src/multiplayer/flightState.js';
import { FlightPrediction, SnapshotBuffer } from '../src/multiplayer/prediction.js';
import { Vec3, Quat } from '../src/math.js';
const command = (seq, pitch = 0) => ({ seq, axes: { ...neutralAxes(), pitch }, toggles: [] });
test('control protocol rejects malformed, unbounded and state-injection commands', () => {
  assert.equal(validCommand(command(1, 1)), true);
  for (const c of [
    null,
    command(-1),
    command(1, Infinity),
    command(1, NaN),
    command(1, 2),
    { ...command(1), position: [0, 0, 0] },
    { ...command(1), toggles: ['fuel'] },
    { ...command(1), toggles: ['gear', 'gear'] },
  ])
    assert.equal(validCommand(c), false);
  assert.equal(validRoomCode('ABC234'), true);
  for (const c of ['abc234', 'AAAAAA1', '<script>', null]) assert.equal(validRoomCode(c), false);
});
test('rooms enforce capacity, stable call signs, isolation and removal of empty worlds', () => {
  const rooms = new MultiplayerRooms({ maxRooms: 2, orphanTimeout: 0 }),
    a = rooms.create(),
    b = rooms.create();
  assert.equal(rooms.create(), null);
  const one = rooms.join(a, 'f16'),
    two = rooms.join(a, 'fa18');
  assert.equal(one.callSign, 'Falcon One');
  assert.equal(two.callSign, 'Falcon Two');
  for (let i = 0; i < 3; i++) assert.ok(rooms.join(a, 'f16'));
  assert.equal(rooms.join(a, 'f16'), null);
  assert.notEqual(a.world.skySeed, b.world.skySeed);
  const solo = rooms.join(b, 'f16'),
    before = solo.state.position.clone();
  rooms.inputs(one, [command(1, 1)]);
  rooms.step();
  assert.equal(one.ack, 1);
  assert.equal(solo.ack, 0);
  assert.ok(solo.state.position.distance(before) > 0);
  assert.notEqual(one.state.orientation.x, solo.state.orientation.x);
  rooms.leave(a, one);
  assert.equal(one.connected, false);
  assert.equal(rooms.join(a, 'f16'), null);
  assert.equal(rooms.resume(a, one.sessionToken).callSign, 'Falcon One');
  rooms.leave(b, solo);
  rooms.step();
  assert.equal(rooms.rooms.has(b.code), false);
});
test('server consumes at most one command per physics tick, rejecting replay, gaps and queue flooding atomically', () => {
  const rooms = new MultiplayerRooms(),
    room = rooms.create(),
    p = rooms.join(room, 'f16');
  assert.equal(rooms.inputs(p, [command(1), command(3)]), false);
  assert.equal(p.received, 0);
  assert.equal(p.queue.length, 0);
  assert.equal(rooms.inputs(p, [command(1), command(2)]), true);
  rooms.step();
  assert.equal(p.ack, 1);
  assert.equal(p.queue.length, 1);
  assert.equal(rooms.inputs(p, [command(2)]), false);
  assert.equal(
    rooms.inputs(
      p,
      Array.from({ length: 49 }, (_, i) => command(i + 3)),
    ),
    false,
  );
  rooms.step();
  assert.equal(p.ack, 2);
  const angle = p.state.orientation.clone();
  rooms.step();
  assert.equal(p.ack, 2);
  assert.deepEqual(p.state.orientation, angle);
});
test('snapshot round trips preserve physics state without aliasing authority or sending smoke history', () => {
  const rooms = new MultiplayerRooms(),
    room = rooms.create(),
    p = rooms.join(room, 'f16');
  for (let i = 0; i < 40; i++) applyFlightCommand(p.state, command(i + 1, 0.4), NETWORK_STEP);
  const wire = JSON.parse(JSON.stringify(packFlight(p.state))),
    restored = unpackFlight(wire);
  assert.ok(restored.position instanceof Vec3);
  assert.ok(restored.orientation instanceof Quat);
  assert.equal(wire.condition.smoke.length, 0);
  applyFlightCommand(restored, command(41, 0.4), NETWORK_STEP);
  applyFlightCommand(p.state, command(41, 0.4), NETWORK_STEP);
  assert.ok(restored.position.distance(p.state.position) < 1e-8);
  wire.condition.parts.leftWing = 0;
  assert.equal(p.state.condition.parts.leftWing, 1);
});
test('local prediction reconciles acknowledged controls and replays only pending inputs once', () => {
  const rooms = new MultiplayerRooms(),
    room = rooms.create(),
    p = rooms.join(room, 'f16');
  const prediction = new FlightPrediction();
  prediction.reset(rooms.snapshot(room).players[0]);
  for (let i = 0; i < 12; i++)
    prediction.step({ ...neutralAxes(), pitch: 0.3 }, i === 0 ? ['airbrake'] : []);
  const expected = prediction.state.position.clone();
  rooms.inputs(p, prediction.pending.slice(0, 6));
  for (let i = 0; i < 6; i++) rooms.step();
  prediction.reconcile(rooms.snapshot(room).players[0]);
  assert.equal(prediction.pending.length, 6);
  assert.ok(prediction.state.position.distance(expected) < 1e-8);
  assert.equal(prediction.state.airbrake, true);
});
test('remote interpolation handles quaternion sign, duplicate packets, missing frames and disconnects', () => {
  const rooms = new MultiplayerRooms(),
    room = rooms.create(),
    p = rooms.join(room, 'f16');
  const a = rooms.snapshot(room);
  a.time = 0;
  p.state.position.x += 100;
  room.tick = 12;
  const b = rooms.snapshot(room);
  b.time = 0.1;
  const buffer = new SnapshotBuffer();
  assert.equal(buffer.add(a), true);
  assert.equal(buffer.add(a), true);
  buffer.add(b);
  assert.equal(buffer.sample(p.id, 0.05).position.x, 50);
  assert.equal(buffer.sample(p.id, 5).position.x, 100);
  assert.equal(buffer.sample('missing', 0.05), null);
  const q = Quat.euler(0.5, 0.1, 0.2),
    inverseSign = new Quat(-q.x, -q.y, -q.z, -q.w);
  const mid = interpolateOrientation(q, inverseSign, 0.5);
  assert.ok(Math.abs(mid.w - q.w) < 1e-8);
});
test('host and websocket origin validation preserve local defaults and require explicit LAN hosts', () => {
  assert.equal(allowedHost('127.0.0.1:5173'), true);
  assert.equal(allowedHost('192.168.1.5:5173'), false);
  assert.equal(allowedHost('192.168.1.5:5173', ['192.168.1.5:5173']), true);
  for (const origin of ['http://evil.test', 'null', 'http://localhost:5174', undefined])
    assert.equal(
      sameOriginRequest({ headers: { host: 'localhost:5173', origin }, socket: {} }),
      false,
    );
  assert.equal(
    sameOriginRequest({
      headers: { host: 'localhost:5173', origin: 'http://localhost:5173' },
      socket: {},
    }),
    true,
  );
});
async function fixture(t) {
  const server = createStaticServer({ root: process.cwd() }),
    multiplayer = attachMultiplayer(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    multiplayer.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return { url: origin.replace('http:', 'ws:') + '/multiplayer', origin, multiplayer };
}
async function connect(t, f, hello) {
  const ws = new WebSocket(f.url, { origin: f.origin }),
    messages = [],
    waiting = [];
  ws.on('message', (data, binary) => {
    const msg = decodeSnapshot(binary ? data : data.toString());
    messages.push(msg);
    for (const notify of [...waiting]) notify();
  });
  ws.on('error', () => {});
  t.after(() => ws.terminate());
  await once(ws, 'open');
  const next = (predicate) =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for multiplayer message'));
      }, 5000);
      const cleanup = () => {
        clearTimeout(timeout);
        const i = waiting.indexOf(check);
        if (i >= 0) waiting.splice(i, 1);
      };
      const check = () => {
        const i = messages.findIndex(predicate);
        if (i >= 0) {
          const msg = messages.splice(i, 1)[0];
          cleanup();
          resolve(msg);
        }
      };
      waiting.push(check);
      check();
    });
  ws.send(
    JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, aircraftId: 'f16', ...hello }),
  );
  return { ws, next };
}
test(
  'two real websocket clients share a live world, receive authoritative controls and can leave independently',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t),
      one = await connect(t, f, { mode: 'create' });
    const welcome = await one.next((m) => m.type === 'welcome');
    assert.equal((await fetch(f.origin + '/multiplayer.html')).status, 200);
    const two = await connect(t, f, { mode: 'join', code: welcome.code, aircraftId: 'fa18' });
    const joined = await two.next((m) => m.type === 'welcome');
    assert.equal(joined.players.length, 2);
    assert.deepEqual(joined.world, welcome.world);
    one.ws.send(
      JSON.stringify({ type: 'input', round: 1, commands: [command(1, 1), command(2, 1)] }),
    );
    const shared = await two.next(
      (m) => m.type === 'snapshot' && m.players.find((p) => p.id === welcome.id)?.ack === 2,
    );
    assert.ok(shared.players.find((p) => p.id === welcome.id).state.orientation.x < 0);
    for (let i = 0; i < 3; i++) {
      const peer = await connect(t, f, { mode: 'join', code: welcome.code });
      await peer.next((m) => m.type === 'welcome');
    }
    const sixth = await connect(t, f, { mode: 'join', code: welcome.code });
    assert.equal((await sixth.next((m) => m.type === 'error')).code, 'room-full');
    two.ws.close();
    await once(two.ws, 'close');
    assert.equal(
      (
        await one.next(
          (m) => m.type === 'snapshot' && m.players.some((p) => p.id === joined.id && !p.connected),
        )
      ).players[0].id,
      welcome.id,
    );
    one.ws.send(JSON.stringify({ type: 'ping', sent: 123 }));
    assert.equal((await one.next((m) => m.type === 'pong')).sent, 123);
  },
);
test(
  'websocket rejects cross-origin handshakes and closes forged flight-state input',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    const cross = new WebSocket(f.url, { origin: 'http://evil.test' });
    const [error] = await once(cross, 'error');
    assert.match(error.message, /403/);
    const one = await connect(t, f, { mode: 'create' });
    await one.next((m) => m.type === 'welcome');
    one.ws.send(
      JSON.stringify({
        type: 'input',
        round: 1,
        commands: [{ ...command(1), position: { x: 9999 } }],
      }),
    );
    const [code] = await once(one.ws, 'close');
    assert.equal(code, 1008);
  },
);

test('late join spawns next to the active pilot rather than kilometres behind', () => {
  const rooms = new MultiplayerRooms(),
    room = rooms.create(),
    one = rooms.join(room, 'f16');
  one.state.position = new Vec3(20000, 5000, 26000);
  one.state.orientation = Quat.euler(1.2, 0.1, 0.3);
  const two = rooms.join(room, 'fa18');
  assert.ok(two.state.position.distance(one.state.position) < 250);
  assert.ok(two.state.position.distance(one.state.position) > 100);
  assert.notEqual(two.state.velocity, one.state.velocity);
  assert.deepEqual(two.state.velocity, one.state.velocity);
});

test(
  'sustained input batches run through the real server without flooding or losing acknowledgements',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t),
      one = await connect(t, f, { mode: 'create' });
    const welcome = await one.next((m) => m.type === 'welcome');
    let seq = 0;
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        const commands = Array.from({ length: 6 }, () => ({
          ...command(++seq, 0.15),
          axes: { ...neutralAxes(), pitch: 0.15, roll: 0.1 },
        }));
        one.ws.send(JSON.stringify({ type: 'input', round: 1, commands }));
        if (seq >= 120) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
      t.after(() => clearInterval(timer));
    });
    const snapshot = await one.next((m) => m.type === 'snapshot' && m.players[0].ack === 120);
    assert.equal(one.ws.readyState, WebSocket.OPEN);
    assert.equal(snapshot.players[0].id, welcome.id);
    assert.equal(snapshot.players[0].state.crashed, false);
    assert.ok(Number.isFinite(snapshot.players[0].state.position.y));
    const settled = await one.next((m) => m.type === 'snapshot' && m.tick > snapshot.tick + 12);
    assert.equal(settled.players[0].ack, 120);
  },
);

test(
  'two websocket clients observe identical shared shots, damage and explosions with private ammunition',
  { timeout: 20000 },
  async (t) => {
    const f = await fixture(t),
      one = await connect(t, f, { mode: 'create' });
    const welcome = await one.next((m) => m.type === 'welcome');
    const two = await connect(t, f, { mode: 'join', code: welcome.code });
    await two.next((m) => m.type === 'welcome');
    const room = f.multiplayer.rooms.rooms.get(welcome.code),
      player = room.players.get(welcome.id),
      target = room.combat.targets[0];
    player.state.position = target.position.clone().add(new Vec3(0, 0, -700));
    player.state.orientation = target.flight.orientation.clone();
    player.state.velocity = target.velocity.clone();
    const combatCommand = (seq, fire, cycle) => ({
      ...command(seq),
      combat: { weapon: 'aam', fire, cycle, countermeasures: false },
    });
    one.ws.send(
      JSON.stringify({ type: 'input', round: 1, commands: [combatCommand(1, false, true)] }),
    );
    await one.next(
      (m) => m.type === 'snapshot' && m.players.find((p) => p.id === welcome.id)?.combat.aim.locked,
    );
    one.ws.send(
      JSON.stringify({ type: 'input', round: 1, commands: [combatCommand(2, true, false)] }),
    );
    const isLaunch = (m) =>
      m.type === 'snapshot' && m.combat.events.some((e) => e.type === 'missile-launch');
    const a = await one.next(isLaunch),
      b = await two.next(isLaunch);
    assert.deepEqual(
      a.combat.events.find((e) => e.type === 'missile-launch'),
      b.combat.events.find((e) => e.type === 'missile-launch'),
    );
    assert.equal(a.players.find((p) => p.id === welcome.id).state.ammo.aam, 1);
    assert.equal(a.players.find((p) => p.id !== welcome.id).state.ammo.aam, 2);
    const isHit = (m) =>
      m.type === 'snapshot' && m.combat.events.some((e) => e.type === 'target-hit');
    const hitA = await one.next(isHit),
      hitB = await two.next(isHit);
    assert.deepEqual(
      hitA.combat.events.find((e) => e.type === 'target-hit'),
      hitB.combat.events.find((e) => e.type === 'target-hit'),
    );
    assert.ok(hitA.combat.targets[0].damage > 0);
    assert.ok(hitB.combat.targets[0].damage > 0);
    assert.ok(hitA.combat.events.some((e) => e.type === 'explosion'));
  },
);

test(
  'combat rooms synchronize one armed AI and inherit the creator scenario for both websocket pilots',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t),
      one = await connect(t, f, { mode: 'create', scenario: 'combat' });
    const welcome = await one.next((m) => m.type === 'welcome');
    const two = await connect(t, f, { mode: 'join', code: welcome.code, scenario: 'range' });
    const joined = await two.next((m) => m.type === 'welcome');
    assert.equal(welcome.scenario, 'combat');
    assert.equal(joined.scenario, 'combat');
    assert.equal(joined.combat.targets.filter((t) => t.aiControlled).length, 1);
    const room = f.multiplayer.rooms.rooms.get(welcome.code),
      enemy = room.combat.ai.units[0];
    room.tick = 2400;
    enemy.flight.position = new Vec3(0, 3000, 0);
    enemy.flight.orientation = Quat.euler(0, 0, 0);
    enemy.flight.velocity = new Vec3(0, 0, 200);
    enemy.position = enemy.flight.position;
    enemy.velocity = enemy.flight.velocity;
    enemy.heading = 0;
    for (const [index, player] of [...room.players.values()].entries()) {
      player.state.position = new Vec3(index * 1000, 3000, 6000);
      player.state.orientation = Quat.euler(0, 0, 0);
      player.state.velocity = new Vec3(0, 0, 170);
    }
    const launched = (m) =>
      m.type === 'snapshot' &&
      m.combat.events.some((e) => e.type === 'missile-launch' && e.sourceId === enemy.id);
    const a = await one.next(launched),
      b = await two.next(launched);
    const shot = a.combat.events.find(
      (e) => e.type === 'missile-launch' && e.sourceId === enemy.id,
    );
    assert.deepEqual(
      shot,
      b.combat.events.find((e) => e.id === shot.id),
    );
    assert.ok([welcome.id, joined.id].includes(shot.targetId));
    assert.ok(expandSnapshot(a).combat.projectiles.some((p) => p.sourceId === enemy.id));
    assert.ok(expandSnapshot(b).combat.projectiles.some((p) => p.sourceId === enemy.id));
    assert.ok(a.combat.targets.find((t) => t.id === enemy.id).flight.ammo.aam < 4);
    assert.equal(a.combat.ai.active, true);
  },
);

test(
  'two websocket pilots receive the same immutable cooperative result and a closed sortie cannot be rejoined',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t),
      one = await connect(t, f, { mode: 'create', scenario: 'cooperative' });
    const welcome = await one.next((m) => m.type === 'welcome');
    assert.equal(welcome.mission.phase, 'waiting');
    const waiting = await one.next((m) => m.type === 'snapshot' && m.tick > welcome.tick + 6);
    assert.equal(waiting.mission.elapsed, 0);
    assert.deepEqual(waiting.players[0].state.position, welcome.players[0].state.position);
    const two = await connect(t, f, { mode: 'join', code: welcome.code });
    const joined = await two.next((m) => m.type === 'welcome');
    assert.equal(joined.mission.phase, 'waiting');
    for (const peer of [one, two])
      peer.ws.send(JSON.stringify({ type: 'ready', revision: joined.lobby.revision, ready: true }));
    await one.next((m) => m.type === 'snapshot' && m.lobby.players.every((p) => p.ready));
    one.ws.send(JSON.stringify({ type: 'start', revision: joined.lobby.revision }));
    await two.next((m) => m.type === 'snapshot' && m.mission.phase === 'active');
    const room = f.multiplayer.rooms.rooms.get(welcome.code);
    applyDamage(room.combat.targets.find((t) => t.aiControlled).flight, 100, 'fuselage');
    room.combat.targets.find((t) => t.kind === 'ground').alive = false;
    const success = (m) => m.type === 'snapshot' && m.mission.phase === 'success';
    const a = await one.next(success),
      b = await two.next(success);
    assert.deepEqual(a.mission, b.mission);
    assert.equal(a.mission.participants.length, 2);
    assert.ok(a.mission.objectives.every((o) => o.status === 'complete'));
    const settled = await two.next((m) => success(m) && m.tick > a.tick + 12);
    assert.deepEqual(settled.mission, a.mission);
    one.ws.close();
    await once(one.ws, 'close');
    const replacement = await connect(t, f, { mode: 'join', code: welcome.code });
    assert.equal((await replacement.next((m) => m.type === 'error')).code, 'room-started');
  },
);

test(
  'websocket preflight shares equipment and invalidates readiness before a synchronized start',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t),
      a = await connect(t, f, { mode: 'create', scenario: 'cooperative' });
    const first = await a.next((m) => m.type === 'welcome');
    const b = await connect(t, f, { mode: 'join', code: first.code });
    const second = await b.next((m) => m.type === 'welcome');
    const selection = defaultSelection('fa18');
    selection.fuelFraction = 0.4;
    selection.loadout.gun = false;
    selection.loadout.stations[0] = null;
    a.ws.send(JSON.stringify({ type: 'configure', revision: second.lobby.revision, selection }));
    const configured = await b.next(
      (m) => m.type === 'snapshot' && m.lobby.revision > second.lobby.revision,
    );
    assert.deepEqual(configured.lobby.players.find((p) => p.id === first.id).selection, selection);
    const own = configured.players.find((p) => p.id === first.id);
    assert.equal(own.state.aircraftId, 'fa18');
    assert.equal(own.state.ammo.gun, 0);
    a.ws.send(JSON.stringify({ type: 'ready', revision: configured.lobby.revision, ready: true }));
    await b.next(
      (m) => m.type === 'snapshot' && m.lobby.players.find((p) => p.id === first.id).ready,
    );
    b.ws.send(
      JSON.stringify({
        type: 'configure',
        revision: configured.lobby.revision,
        selection: defaultSelection('f16'),
      }),
    );
    const changed = await a.next(
      (m) => m.type === 'snapshot' && m.lobby.revision > configured.lobby.revision,
    );
    assert.ok(changed.lobby.players.every((p) => !p.ready));
    assert.equal(changed.mission.phase, 'waiting');
    a.ws.send(JSON.stringify({ type: 'ready', revision: configured.lobby.revision, ready: true }));
    assert.equal((await a.next((m) => m.type === 'error')).code, 'lobby-changed');
    for (const peer of [a, b])
      peer.ws.send(
        JSON.stringify({ type: 'ready', revision: changed.lobby.revision, ready: true }),
      );
    await a.next((m) => m.type === 'snapshot' && m.lobby.players.every((p) => p.ready));
    a.ws.send(JSON.stringify({ type: 'start', revision: changed.lobby.revision }));
    const active = (m) => m.type === 'snapshot' && m.mission.phase === 'active';
    const sa = await a.next(active),
      sb = await b.next(active);
    assert.deepEqual(sa.mission, sb.mission);
    assert.ok(sa.lobby.players.every((p) => p.ready));
    assert.equal(sa.players.find((p) => p.id === second.id).state.aircraftId, 'f16');
  },
);

test(
  'two real clients share the defense terrain, runway start, return phase and landing result',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t),
      a = await connect(t, f, { mode: 'create', scenario: 'cooperative' });
    const welcome = await a.next((m) => m.type === 'welcome');
    const b = await connect(t, f, { mode: 'join', code: welcome.code });
    const joined = await b.next((m) => m.type === 'welcome');
    a.ws.send(
      JSON.stringify({
        type: 'mission',
        revision: joined.lobby.revision,
        missionId: 'defend-base',
      }),
    );
    const defense = (m) => m.type === 'snapshot' && m.mission.assignment === 'defend-base';
    const sa = await a.next(defense),
      sb = await b.next(defense);
    assert.deepEqual(sa.world, sb.world);
    assert.equal(sa.world.surface, 'winter');
    assert.ok(sa.players.every((p) => p.state.onGround));
    assert.equal(sa.combat.targets.filter((t) => t.team === 'enemy' && t.kind === 'air').length, 3);
    for (const peer of [a, b])
      peer.ws.send(JSON.stringify({ type: 'ready', revision: sa.lobby.revision, ready: true }));
    await a.next((m) => defense(m) && m.lobby.players.every((p) => p.ready));
    a.ws.send(JSON.stringify({ type: 'start', revision: sa.lobby.revision }));
    await a.next((m) => defense(m) && m.mission.phase === 'active');
    const room = f.multiplayer.rooms.rooms.get(welcome.code);
    for (const target of room.combat.targets.filter((t) => t.team === 'enemy' && t.kind === 'air'))
      applyDamage(target.flight, 100, 'fuselage');
    await b.next((m) => defense(m) && m.mission.stage === 'return');
    for (const player of room.players.values())
      Object.assign(player.state, {
        position: new Vec3(0, 2.001, -1000 - player.slot * 150),
        previousPosition: new Vec3(0, 3, -1000 - player.slot * 150),
        velocity: new Vec3(0, -1, 65),
        orientation: Quat.euler(0, (3 * Math.PI) / 180, 0),
        onGround: false,
        airborne: true,
        gear: true,
        flaps: true,
        flapPosition: 1,
        throttle: 0,
        engineSpool: 0,
        landingMode: 'on',
      });
    await a.next((m) => defense(m) && m.players.every((p) => p.state.landing?.success));
    for (const p of room.players.values()) {
      p.state.velocity = new Vec3();
      p.state.speed = 0;
    }
    const success = (m) => defense(m) && m.mission.phase === 'success';
    const ra = await a.next(success),
      rb = await b.next(success);
    assert.deepEqual(ra.mission, rb.mission);
    assert.equal(ra.mission.reason, 'base-defended-and-landed');
  },
);

test(
  'five real clients start an arena, keep private sessions and recover the same AI-controlled aircraft',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t),
      clients = [],
      welcomes = [];
    clients.push(await connect(t, f, { mode: 'create', scenario: 'arena' }));
    welcomes.push(await clients[0].next((m) => m.type === 'welcome'));
    for (let i = 1; i < 5; i++) {
      clients.push(await connect(t, f, { mode: 'join', code: welcomes[0].code }));
      welcomes.push(await clients[i].next((m) => m.type === 'welcome'));
    }
    const last = welcomes.at(-1),
      revision = last.lobby.revision;
    assert.equal(last.players.length, 5);
    assert.equal(new Set(welcomes.map((m) => m.sessionToken)).size, 5);
    assert.ok(last.players.every((p) => p.sessionToken === undefined));
    for (const c of clients) c.ws.send(JSON.stringify({ type: 'ready', revision, ready: true }));
    await clients[0].next((m) => m.type === 'snapshot' && m.lobby.players.every((p) => p.ready));
    clients[0].ws.send(JSON.stringify({ type: 'start', revision }));
    const started = await Promise.all(
      clients.map((c) => c.next((m) => m.type === 'snapshot' && m.mission.phase === 'active')),
    );
    assert.ok(started.every((m) => m.players.length === 5));
    const room = f.multiplayer.rooms.rooms.get(last.code),
      pilot = room.players.get(welcomes[1].id);
    pilot.state.ammo.aam = 1;
    applyDamage(pilot.state, 9, 'leftWing');
    clients[1].ws.close();
    await once(clients[1].ws, 'close');
    const detached = await clients[0].next(
      (m) => m.type === 'snapshot' && m.players.some((p) => p.id === pilot.id && !p.connected),
    );
    assert.equal(detached.players.length, 5);
    assert.ok(!JSON.stringify(detached).includes(welcomes[1].sessionToken));
    const bad = await connect(t, f, { mode: 'join', code: last.code, resumeToken: 'e'.repeat(64) });
    assert.equal((await bad.next((m) => m.type === 'error')).code, 'session-invalid');
    const returning = await connect(t, f, {
      mode: 'join',
      code: last.code,
      resumeToken: welcomes[1].sessionToken,
    });
    const restored = await returning.next((m) => m.type === 'welcome');
    assert.equal(restored.id, pilot.id);
    assert.equal(restored.resumed, true);
    assert.equal(restored.players.find((p) => p.id === pilot.id).state.ammo.aam, 1);
    assert.ok(restored.players.find((p) => p.id === pilot.id).state.damage >= 9);
    const stale = await connect(t, f, {
      mode: 'join',
      code: last.code,
      resumeToken: welcomes[1].sessionToken,
    });
    await stale.next((m) => m.type === 'welcome');
    await once(returning.ws, 'close');
    const retained = await clients[0].next(
      (m) =>
        m.type === 'snapshot' &&
        m.tick > detached.tick &&
        m.players.some((p) => p.id === pilot.id && p.connected),
    );
    assert.equal(retained.players.length, 5);
    for (const p of room.players.values()) if (p.id !== welcomes[0].id) p.state.crashed = true;
    const ended = await clients[0].next(
      (m) => m.type === 'snapshot' && m.mission.phase === 'success',
    );
    assert.equal(ended.mission.winnerId, welcomes[0].id);
  },
);

test(
  'a resume token cannot create empty rooms or consume the room budget',
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t),
      bad = await connect(t, f, { mode: 'create', resumeToken: 'a'.repeat(64) });
    const [code] = await once(bad.ws, 'close');
    assert.equal(code, 1008);
    assert.equal(f.multiplayer.rooms.rooms.size, 0);
  },
);

test(
  'three localhost clients transfer the host, review a shared result and start another round without reconnecting',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t),
      one = await connect(t, f, { mode: 'create', scenario: 'arena' }),
      first = await one.next((m) => m.type === 'welcome');
    const two = await connect(t, f, { mode: 'join', code: first.code }),
      second = await two.next((m) => m.type === 'welcome');
    const three = await connect(t, f, { mode: 'join', code: first.code }),
      third = await three.next((m) => m.type === 'welcome');
    for (const p of [one, two, three])
      p.ws.send(JSON.stringify({ type: 'ready', revision: third.lobby.revision, ready: true }));
    await one.next((m) => m.type === 'snapshot' && m.lobby.players.every((p) => p.ready));
    one.ws.send(JSON.stringify({ type: 'start', revision: third.lobby.revision }));
    await two.next((m) => m.type === 'snapshot' && m.mission.phase === 'active');
    const closed = once(one.ws, 'close');
    one.ws.close();
    await closed;
    await two.next((m) => m.type === 'snapshot' && m.lobby.hostId === second.id);
    const room = f.multiplayer.rooms.rooms.get(first.code);
    room.players.get(first.id).state.crashed = true;
    room.players.get(third.id).state.crashed = true;
    const result = await two.next((m) => m.type === 'snapshot' && m.mission.phase === 'success');
    assert.equal(result.mission.winnerId, second.id);
    two.ws.send(JSON.stringify({ type: 'rematch', revision: result.lobby.revision }));
    const lobby = await three.next(
      (m) => m.type === 'snapshot' && m.round === 2 && m.mission.phase === 'waiting',
    );
    assert.equal(lobby.players.length, 2);
    assert.equal(lobby.lobby.hostId, second.id);
    assert.ok(lobby.players.every((p) => !p.state.crashed));
    two.ws.send(JSON.stringify({ type: 'input', round: 1, commands: [command(999, 1)] }));
    for (const p of [two, three])
      p.ws.send(JSON.stringify({ type: 'ready', revision: lobby.lobby.revision, ready: true }));
    await two.next(
      (m) => m.type === 'snapshot' && m.round === 2 && m.lobby.players.every((p) => p.ready),
    );
    two.ws.send(JSON.stringify({ type: 'start', revision: lobby.lobby.revision }));
    await three.next((m) => m.type === 'snapshot' && m.round === 2 && m.mission.phase === 'active');
    two.ws.send(JSON.stringify({ type: 'input', round: 2, commands: [command(1, 0.1)] }));
    const moved = await three.next(
      (m) =>
        m.type === 'snapshot' &&
        m.round === 2 &&
        m.players.find((p) => p.id === second.id)?.ack === 1,
    );
    assert.equal(two.ws.readyState, WebSocket.OPEN);
    assert.equal(moved.combat.events.length, 0);
    assert.equal(f.multiplayer.rooms.rooms.size, 1);
  },
);

test('default server limits admit ten rooms of five pilots, reject overflow and reuse released capacity', () => {
  let now = 0;
  const rooms = new MultiplayerRooms({ now: () => now });
  const created = Array.from({ length: 10 }, () => rooms.create());
  assert.ok(created.every(Boolean));
  assert.equal(rooms.create(), null);
  for (const room of created) {
    for (let i = 0; i < 5; i++) assert.ok(rooms.join(room, 'f16'));
    assert.equal(rooms.join(room, 'fa18'), null);
  }
  assert.equal(
    [...rooms.rooms.values()].reduce((n, r) => n + r.players.size, 0),
    50,
  );
  const room = created[0],
    pilot = room.players.values().next().value;
  assert.equal(rooms.resume(room, pilot.sessionToken), pilot);
  for (const p of [...room.players.values()]) rooms.leave(room, p);
  assert.equal(rooms.rooms.size, 10);
  assert.equal(rooms.create(), null);
  now = 120000;
  rooms.step();
  assert.equal(rooms.rooms.size, 9);
  assert.ok(rooms.create());
  assert.equal(rooms.rooms.size, 10);
  assert.equal(rooms.create(), null);
});

test(
  'real localhost clients cannot create an eleventh room but can join an existing room at capacity',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    let first;
    for (let i = 0; i < 10; i++) {
      const client = await connect(t, f, { mode: 'create' });
      const welcome = await client.next((m) => m.type === 'welcome');
      first ||= welcome;
    }
    const overflow = await connect(t, f, { mode: 'create' });
    assert.equal((await overflow.next((m) => m.type === 'error')).code, 'server-full');
    assert.equal(f.multiplayer.rooms.rooms.size, 10);
    const joining = await connect(t, f, { mode: 'join', code: first.code });
    assert.equal((await joining.next((m) => m.type === 'welcome')).players.length, 2);
    assert.equal(f.multiplayer.rooms.rooms.size, 10);
  },
);

test('pilot names are bounded Unicode display text, with an optional automatic call sign', () => {
  assert.equal(normalizePlayerName(), '');
  assert.equal(normalizePlayerName('   '), '');
  assert.equal(normalizePlayerName('  Árvíz-01  '), 'Árvíz-01');
  assert.equal(normalizePlayerName('A\u0301sz'), 'Ász');
  assert.equal(normalizePlayerName('1234567890'), '1234567890');
  for (const value of [
    null,
    7,
    {},
    '12345678901',
    '<img>',
    'Ace\nTwo',
    'Ace\u202e',
    'Ace/Two',
    'x'.repeat(65),
  ])
    assert.equal(normalizePlayerName(value), null);
  const rooms = new MultiplayerRooms(),
    room = rooms.create();
  assert.equal(rooms.join(room, 'f16', '<script>'), null);
  assert.equal(room.players.size, 0);
  assert.equal(rooms.join(room, 'f16', '  Ace  ').callSign, 'Ace');
  assert.equal(rooms.join(room, 'f16').callSign, 'Falcon Two');
});

test(
  'real clients share pilot names across the lobby, aircraft, recovery and final results',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t);
    const one = await connect(t, f, {
      mode: 'create',
      scenario: 'arena',
      playerName: '  Árvíz-01  ',
    });
    const first = await one.next((m) => m.type === 'welcome');
    assert.equal(first.players[0].callSign, 'Árvíz-01');
    const two = await connect(t, f, { mode: 'join', code: first.code, playerName: 'Bandit_2' });
    const second = await two.next((m) => m.type === 'welcome');
    assert.deepEqual(
      second.players.map((p) => p.callSign),
      ['Árvíz-01', 'Bandit_2'],
    );
    assert.deepEqual(
      second.lobby.players.map((p) => p.callSign),
      ['Árvíz-01', 'Bandit_2'],
    );
    const revision = second.lobby.revision;
    for (const c of [one, two]) c.ws.send(JSON.stringify({ type: 'ready', revision, ready: true }));
    await one.next((m) => m.type === 'snapshot' && m.lobby.players.every((p) => p.ready));
    one.ws.send(JSON.stringify({ type: 'start', revision }));
    await two.next((m) => m.type === 'snapshot' && m.mission.phase === 'active');
    const room = f.multiplayer.rooms.rooms.get(first.code);
    const disconnected = once(two.ws, 'close');
    two.ws.close();
    await disconnected;
    const returning = await connect(t, f, {
      mode: 'join',
      code: first.code,
      resumeToken: second.sessionToken,
      playerName: 'NewName',
    });
    const restored = await returning.next((m) => m.type === 'welcome');
    assert.equal(restored.players.find((p) => p.id === second.id).callSign, 'Bandit_2');
    assert.equal(restored.id, second.id);
    room.players.get(second.id).state.crashed = true;
    const ended = await one.next((m) => m.type === 'snapshot' && m.mission.phase === 'success');
    assert.deepEqual(
      ended.mission.participants.map((p) => p.callSign).sort(),
      ['Bandit_2', 'Árvíz-01'].sort(),
    );
  },
);

test('invalid pilot names are rejected before allocating a room', async (t) => {
  const f = await fixture(t);
  for (const playerName of ['<script>', '12345678901', null, { name: 'Ace' }]) {
    const c = await connect(t, f, { mode: 'create', playerName });
    assert.equal((await c.next((m) => m.type === 'error')).code, 'player-name-invalid');
    assert.equal(f.multiplayer.rooms.rooms.size, 0);
  }
});
