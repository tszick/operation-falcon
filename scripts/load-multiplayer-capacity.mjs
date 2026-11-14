import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createStaticServer } from '../server/static-server.mjs';
import { attachMultiplayer } from '../server/multiplayer-server.mjs';
import { MultiplayerClient } from '../src/multiplayer/client.js';
import { NETWORK_STEP, PROTOCOL_VERSION, neutralAxes } from '../src/multiplayer/protocol.js';
import { LocalNetworkLink, memorySession } from '../tests/helpers/local-network.mjs';
import { CombatLoadPilot } from '../tests/helpers/combat-load-pilot.js';
const script = fileURLToPath(import.meta.url);
const send = (value) => {
  if (process.connected) process.send(value);
};
async function until(check, ms = 15000) {
  const end = performance.now() + ms;
  while (!check()) {
    if (performance.now() > end) throw Error('Local capacity test timed out');
    await sleep(20);
  }
}
function loopback(origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
}
async function serverWorker() {
  const server = createStaticServer({ root: process.cwd() });
  const multi = attachMultiplayer(server, {
    onPerformance: (sample) =>
      send({
        type: 'performance',
        sample: {
          ...sample,
          activeRooms: [...multi.rooms.rooms.values()].filter((r) => r.mission?.phase === 'active')
            .length,
        },
      }),
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  send({ type: 'ready', origin: 'http://127.0.0.1:' + server.address().port });
  async function close() {
    multi.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    if (process.connected) process.disconnect();
  }
  process.on('message', (m) => {
    if (m.type === 'stop') void close();
  });
  process.on('disconnect', () => {
    multi.close();
    server.close();
  });
}
async function clientWorker(origin, scenario, index) {
  loopback(origin);
  const peers = [],
    issues = [];
  let running = false,
    closing = false,
    timer,
    startKey = '',
    rematchKey = '',
    rounds = 0,
    activeSent = false;
  let peakProjectiles = 0,
    peakPending = 0,
    steps = 0,
    maxCallbackMs = 0,
    last = performance.now(),
    accumulator = 0;
  try {
    for (let i = 0; i < 5; i++) {
      const p = { pilot: new CombatLoadPilot(), storage: memorySession() };
      let welcomed = false;
      p.client = new MultiplayerClient({
        baseUrl: origin,
        getStorage: () => p.storage,
        socketFactory: (url) => new LocalNetworkLink(url, origin),
        onWelcome: () => {
          welcomed = true;
        },
        onStatus: (e) => issues.push(e),
        onClose: () => {
          if (!closing) issues.push('unexpected-close');
        },
        onRound: () => {
          p.pilot = new CombatLoadPilot();
          p.cached = null;
          p.readyKey = null;
        },
      });
      peers.push(p);
      p.client.connect({
        mode: i ? 'join' : 'create',
        code: peers[0].client.code,
        scenario,
        aircraftId: i % 2 ? 'fa18' : 'f16',
        playerName: 'Load' + index + '-' + i,
      });
      await until(() => welcomed);
    }
    await until(() => peers.every((p) => p.client.latest.players.length === 5));
    send({ type: 'room-ready', index, code: peers[0].client.code });
    function lobby() {
      if (!running) return;
      const first = peers[0].client.latest,
        host = peers.find((p) => p.client.id === first.lobby.hostId)?.client;
      if (first.mission.phase === 'waiting') {
        for (const p of peers) {
          const m = p.client.latest,
            key = m.round + ':' + m.lobby.revision;
          if (p.readyKey !== key) {
            p.readyKey = key;
            p.client.send({ type: 'ready', revision: m.lobby.revision, ready: true });
          }
        }
        const m = host.latest,
          key = m.round + ':' + m.lobby.revision;
        if (m.lobby.players.every((p) => p.ready) && startKey !== key) {
          startKey = key;
          host.send({ type: 'start', revision: m.lobby.revision });
        }
      } else if (first.mission.phase === 'active') {
        if (!activeSent) {
          activeSent = true;
          send({ type: 'active', index });
        }
      } else if (
        rematchKey !== String(first.round) &&
        peers.every(
          (p) =>
            p.client.latest.round === first.round &&
            ['success', 'failed'].includes(p.client.latest.mission.phase),
        )
      ) {
        rematchKey = String(first.round);
        rounds++;
        host.send({ type: 'rematch', revision: host.latest.lobby.revision });
      }
    }
    timer = setInterval(() => {
      try {
        const begin = performance.now(),
          elapsed = (begin - last) / 1000;
        last = begin;
        accumulator += Math.min(0.05, elapsed);
        while (accumulator >= NETWORK_STEP) {
          for (const p of peers) {
            const c = p.client;
            if (c.stale || !c.prediction.simulating) continue;
            if (!p.cached || begin - (p.controlAt || 0) > 100) {
              p.cached = p.pilot.command(c.prediction.state, c.latest, c.id);
              p.controlAt = begin;
            }
            c.prediction.step(
              p.cached?.axes || neutralAxes(),
              p.cached?.toggles || [],
              p.cached?.combat,
            );
          }
          if (++steps % 6 === 0) {
            for (const p of peers) p.client.flush();
            lobby();
          }
          accumulator -= NETWORK_STEP;
        }
        for (const { client: c } of peers) {
          peakProjectiles = Math.max(peakProjectiles, c.latest.combat.projectiles.length);
          peakPending = Math.max(peakPending, c.prediction.pending.length);
          assert.ok(c.history.frames.length <= 8);
          assert.ok(c.combat.frames.length <= 8);
        }
        maxCallbackMs = Math.max(maxCallbackMs, performance.now() - begin);
      } catch (error) {
        issues.push(error.message);
        clearInterval(timer);
        send({ type: 'fatal', index, error: error.stack });
      }
    }, 8);
    process.on('message', (m) => {
      if (m.type === 'start') running = true;
      if (m.type === 'stop') void finish();
    });
    async function finish() {
      if (closing) return;
      closing = true;
      clearInterval(timer);
      send({
        type: 'result',
        index,
        scenario,
        rounds,
        phase: peers[0].client.latest.mission.phase,
        players: peers.length,
        issues,
        receivedBytes: peers.reduce((n, p) => n + p.client.socket.receivedBytes, 0),
        decodeFailures: peers.reduce((n, p) => n + p.client.metrics.decodeFailures, 0),
        peakProjectiles,
        peakPending,
        maxCallbackMs,
      });
      for (const p of peers) p.client.disconnect();
      if (process.connected) process.disconnect();
    }
    process.on('disconnect', () => {
      closing = true;
      clearInterval(timer);
      for (const p of peers) p.client.disconnect();
    });
  } catch (error) {
    closing = true;
    clearInterval(timer);
    for (const p of peers) p.client.disconnect();
    throw error;
  }
}
function worker(args, onMessage) {
  const child = fork(script, args, {
    execArgv: [
      '--expose-gc',
      ...(args[0] === '--server' && process.env.FALCON_CAPACITY_PROFILE
        ? ['--cpu-prof', '--cpu-prof-dir=' + process.env.FALCON_CAPACITY_PROFILE]
        : []),
    ],
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  child.stderr.on('data', (d) => process.stderr.write(d));
  child.on('message', onMessage);
  return child;
}
async function probe(origin, hello) {
  loopback(origin);
  const socket = new WebSocket(origin.replace('http:', 'ws:') + '/multiplayer', { origin });
  try {
    await once(socket, 'open');
    socket.send(
      JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, aircraftId: 'f16', ...hello }),
    );
    const [data] = await Promise.race([
      once(socket, 'message'),
      sleep(5000).then(() => {
        throw Error('Capacity probe timed out');
      }),
    ]);
    return JSON.parse(data.toString()).code;
  } finally {
    socket.terminate();
  }
}
async function main(seconds, output) {
  const children = [],
    reports = [],
    ready = new Map(),
    active = new Set(),
    results = [],
    failures = [];
  let origin;
  const server = worker(['--server'], (m) => {
    if (m.type === 'ready') origin = m.origin;
    if (m.type === 'performance') reports.push({ receivedAt: performance.now(), ...m.sample });
  });
  children.push(server);
  try {
    await until(() => origin);
    loopback(origin);
    for (let index = 0; index < 10; index++) {
      const child = worker(
        ['--clients', origin, index % 2 ? 'arena' : 'cooperative', String(index)],
        (m) => {
          if (m.type === 'room-ready') ready.set(m.index, m.code);
          if (m.type === 'active') active.add(m.index);
          if (m.type === 'result') results.push(m);
          if (m.type === 'fatal') failures.push(m.error);
        },
      );
      children.push(child);
      child.on('exit', (code) => {
        if (code && !results.some((r) => r.index === index))
          failures.push('Client worker ' + index + ' exited ' + code);
      });
      await until(() => ready.has(index) || failures.length);
      assert.deepEqual(failures, []);
    }
    assert.equal(await probe(origin, { mode: 'create', scenario: 'arena' }), 'server-full');
    assert.equal(await probe(origin, { mode: 'join', code: ready.get(0) }), 'room-full');
    const waitingAt = performance.now();
    await sleep(10000);
    for (const child of children.slice(1)) child.send({ type: 'start' });
    await until(() => active.size === 10 || failures.length);
    assert.deepEqual(failures, []);
    const activeAt = performance.now();
    console.log(JSON.stringify({ progress: 'active', rooms: 10, players: 50, seconds }));
    for (let elapsed = 0; elapsed < seconds; elapsed += 5) {
      await sleep(Math.min(5, seconds - elapsed) * 1000);
      assert.deepEqual(failures, []);
      console.log(JSON.stringify({ progress: 'flight', seconds: Math.min(seconds, elapsed + 5) }));
    }
    const endedAt = performance.now();
    for (const child of children.slice(1)) child.send({ type: 'stop' });
    await until(() => results.length === 10 || failures.length);
    assert.deepEqual(failures, []);
    for (const r of results) {
      assert.deepEqual(r.issues, []);
      assert.equal(r.decodeFailures, 0);
      assert.equal(r.players, 5);
    }
    const windows = (from, to) =>
      reports.filter(
        (s) =>
          s.receivedAt - s.windowMs >= from &&
          s.receivedAt <= to &&
          s.connections === 50 &&
          s.rooms === 10,
      );
    const waiting = windows(waitingAt, activeAt),
      flight = windows(activeAt, endedAt);
    assert.ok(waiting.length);
    assert.ok(flight.length);
    const summarize = (list) => ({
      windows: list.length,
      meanCPUPercent: list.reduce((n, s) => n + s.serverCPUPercent, 0) / list.length,
      maxCPUPercent: Math.max(...list.map((s) => s.serverCPUPercent)),
      minSimulationHz: Math.min(...list.map((s) => s.simulationHz)),
      maxPhysicsP99Ms: Math.max(...list.map((s) => s.physicsP99Ms)),
      maxSnapshotP95Ms: Math.max(...list.map((s) => s.snapshotP95Ms)),
      maxRSSMB: Math.max(...list.map((s) => s.rssMB)),
      maxHeapMB: Math.max(...list.map((s) => s.heapUsedMB)),
      maxGCPauseMs: Math.max(...list.map((s) => s.maxGCPauseMs)),
      maxSchedulerDelayMs: Math.max(...list.map((s) => s.maxSchedulerDelayMs)),
      discardedSimulationMs: list.reduce((n, s) => n + s.discardedSimulationMs, 0),
      meanDownstreamKBps: list.reduce((n, s) => n + s.downstreamKBps, 0) / list.length,
      minActiveRooms: Math.min(...list.map((s) => s.activeRooms)),
    });
    const report = {
      rooms: 10,
      players: 50,
      seconds,
      hostLogicalCPUs: availableParallelism(),
      nodeVersion: process.version,
      platform: process.platform,
      waiting: summarize(waiting),
      flight: summarize(flight),
      clients: results,
      samples: reports,
      note: 'One server process plus ten independent five-pilot processes on loopback. Normal controls, finite ammunition, no rendering or audio. CPU is relative to one core. Mixed cooperative and arena rooms; ended rounds restart normally. Not a VPS or browser FPS measurement.',
    };
    if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ ...report, clients: undefined, samples: undefined }));
  } finally {
    for (const child of children) if (child.connected) child.send({ type: 'stop' });
    await Promise.all(
      children.map(async (child) => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        const timeout = setTimeout(() => child.kill(), 5000);
        await once(child, 'exit');
        clearTimeout(timeout);
      }),
    );
  }
}
try {
  if (process.argv[2] === '--server') await serverWorker();
  else if (process.argv[2] === '--clients')
    await clientWorker(process.argv[3], process.argv[4], Number(process.argv[5]));
  else {
    const seconds = Number(process.argv[2] || 60);
    assert.ok(Number.isInteger(seconds) && seconds >= 20 && seconds <= 300);
    await main(seconds, process.argv[3]);
  }
} catch (error) {
  console.error(error);
  send({ type: 'fatal', error: error.stack });
  process.exitCode = 1;
}
