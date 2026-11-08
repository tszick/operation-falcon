import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { createStaticServer } from '../server/static-server.mjs';
import { attachMultiplayer } from '../server/multiplayer-server.mjs';
import { MultiplayerClient } from '../src/multiplayer/client.js';
import { MultiplayerNotices } from '../src/multiplayer/notices.js';
import { Spectator } from '../src/multiplayer/spectator.js';
import { FlightMessages } from '../src/flightMessages.js';
import { CombatLoadPilot } from '../tests/helpers/combat-load-pilot.js';
import { LocalNetworkLink, memorySession } from '../tests/helpers/local-network.mjs';
import { neutralAxes, NETWORK_STEP } from '../src/multiplayer/protocol.js';
const mb = () => Math.round(process.memoryUsage().heapUsed / 10485.76) / 100;
async function until(check, ms = 8000) {
  const end = performance.now() + ms;
  while (!check()) {
    if (performance.now() > end) throw new Error('Local soak condition timed out');
    await sleep(10);
  }
}
async function serverWorker() {
  const server = createStaticServer({ root: process.cwd() });
  const multi = attachMultiplayer(server, {
    onPerformance: (sample) => process.send({ type: 'performance', sample }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.send({ type: 'ready', origin: 'http://127.0.0.1:' + server.address().port });
  process.on('message', async (message) => {
    if (message.type === 'heap') {
      globalThis.gc?.();
      process.send({ type: 'heap', heapMB: mb() });
    } else if (message.type === 'stop') {
      multi.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      process.disconnect();
    }
  });
  process.on('disconnect', () => {
    multi.close();
    server.close();
  });
}
async function run(scenario, seconds) {
  const child = fork(fileURLToPath(import.meta.url), ['--server'], {
    execArgv: ['--expose-gc'],
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  child.stderr.on('data', (data) => process.stderr.write(data));
  let origin, heapResponse;
  const samples = [],
    peers = [],
    results = [],
    issues = [];
  child.on('message', (message) => {
    if (message.type === 'ready') origin = message.origin;
    else if (message.type === 'performance') samples.push(message.sample);
    else if (message.type === 'heap') heapResponse = message.heapMB;
  });
  async function heap() {
    heapResponse = undefined;
    child.send({ type: 'heap' });
    await until(() => heapResponse !== undefined);
    return heapResponse;
  }
  let timer,
    closing = false;
  try {
    await until(() => origin);
    assert.equal(new URL(origin).hostname, '127.0.0.1');
    for (let i = 0; i < 5; i++) {
      const p = {
        notices: new MultiplayerNotices(),
        feed: new FlightMessages(),
        spectator: new Spectator(),
        pilot: new CombatLoadPilot(),
      };
      peers.push(p);
      let welcomed = false;
      p.client = new MultiplayerClient({
        baseUrl: origin,
        getStorage: () => (p.storage ||= memorySession()),
        reconnectDelays: [200, 500, 1000],
        socketFactory: (url) =>
          new LocalNetworkLink(url, origin, { latency: i * 10, jitter: i * 2 }),
        onWelcome: (msg) => {
          welcomed = true;
          p.welcomes = (p.welcomes || 0) + 1;
          p.notices.reset(msg);
        },
        onSnapshot: (msg) => p.notices.receive(msg, p.client.id),
        onRound: () => {
          p.pilot = new CombatLoadPilot();
          p.feed.reset();
          p.spectator.reset();
          p.cached = null;
          p.controlAt = -Infinity;
        },
        onStatus: (error) => {
          if (error !== 'lobby-changed') issues.push(error);
        },
        onClose: () => {
          if (!closing) issues.push('unexpected-close');
        },
      });
      p.client.connect({
        mode: i ? 'join' : 'create',
        code: peers[0].client.code,
        scenario,
        aircraftId: i % 2 ? 'fa18' : 'f16',
      });
      await until(() => welcomed);
    }
    await until(() => peers.every((p) => p.client.latest.players.length === 5));
    const serverHeapStartMB = await heap();
    globalThis.gc?.();
    const clientHeapStartMB = mb();
    let previous = performance.now(),
      accumulator = 0,
      tick = 0,
      maxParentDelayMs = 0;
    let transitions = 0,
      observed = 0,
      noticeCount = 0;
    const max = {
      history: 0,
      combatFrames: 0,
      pendingInputs: 0,
      projectiles: 0,
      events: 0,
      notifications: 0,
    };
    let startedKey = '',
      rematchKey = '';
    const start = performance.now();
    function advance() {
      const now = performance.now(),
        elapsed = now - previous;
      previous = now;
      maxParentDelayMs = Math.max(maxParentDelayMs, elapsed);
      accumulator += Math.min(0.05, elapsed / 1000);
      while (accumulator >= NETWORK_STEP) {
        for (const p of peers) {
          const c = p.client,
            s = c.prediction.state;
          if (c.socket.readyState !== 1 || c.stale || !c.prediction.simulating) continue;
          if (!p.cached || now - (p.controlAt || 0) > 100) {
            p.cached = p.pilot.command(s, c.latest, c.id);
            p.controlAt = now;
          }
          c.prediction.step(
            p.cached?.axes || neutralAxes(),
            p.cached?.toggles || [],
            p.cached?.combat,
          );
        }
        if (++tick % 6 === 0) for (const p of peers) p.client.flush();
        accumulator -= NETWORK_STEP;
      }
      if (tick % 6 !== 0) return;
      const first = peers[0].client.latest;
      const host = peers.find(
        (p) => p.client.id === first.lobby.hostId && p.client.socket.readyState === 1,
      );
      if (first.mission.phase === 'waiting') {
        for (const p of peers) {
          const msg = p.client.latest,
            key = msg.round + ':' + msg.lobby.revision;
          if (p.client.socket.readyState === 1 && p.readyKey !== key) {
            p.readyKey = key;
            p.client.send({ type: 'ready', ready: true, revision: msg.lobby.revision });
          }
        }
        const msg = host?.client.latest,
          key = msg && msg.round + ':' + msg.lobby.revision;
        if (
          msg?.lobby.players.length === 5 &&
          msg.lobby.players.every((p) => p.ready) &&
          startedKey !== key
        ) {
          startedKey = key;
          host.client.send({ type: 'start', revision: msg.lobby.revision });
        }
      } else if (
        ['success', 'failed'].includes(first.mission.phase) &&
        rematchKey !== String(first.round) &&
        peers.every(
          (p) =>
            p.client.socket.readyState === 1 &&
            p.client.latest.round === first.round &&
            ['success', 'failed'].includes(p.client.latest.mission.phase),
        )
      ) {
        for (const p of peers) assert.deepEqual(p.client.latest.mission, first.mission);
        results.push({
          round: first.round,
          result: first.mission.phase,
          reason: first.mission.reason,
          seconds: first.mission.elapsed,
        });
        rematchKey = String(first.round);
        host.client.send({ type: 'rematch', revision: host.client.latest.lobby.revision });
      }
      for (const p of peers) {
        const c = p.client,
          msg = c.latest;
        for (const n of p.notices.drain()) {
          p.feed.event(n.text, (now - start) / 1000, n.duration, n);
          noticeCount++;
        }
        p.feed.view((now - start) / 1000, 4);
        const own = msg.players.find((q) => q.id === c.id);
        const candidates = p.spectator.update(msg, c.id, own.state);
        if (candidates.length && !p.observedRound) {
          p.observedRound = msg.round;
          observed++;
        }
        for (const [name, value, limit] of [
          ['history', c.history.frames.length, 8],
          ['combatFrames', c.combat.frames.length, 8],
          ['pendingInputs', c.prediction.pending.length, 120],
          ['projectiles', msg.combat.projectiles.length, 192],
          ['events', msg.combat.events.length, 128],
          ['notifications', p.feed.items.filter((i) => !i.channel).length, 128],
        ]) {
          max[name] = Math.max(max[name], value);
          assert.ok(value <= limit, name + ' exceeded bound');
        }
      }
      assert.deepEqual(issues, []);
    }
    let timerError;
    timer = setInterval(() => {
      try {
        advance();
      } catch (error) {
        timerError ||= error;
      }
    }, 8);
    for (let second = 1; second <= seconds; second++) {
      await sleep(1000);
      if (timerError) throw timerError;
      if ([20, 45, 65].includes(second)) {
        const hostId = peers[0].client.latest.lobby.hostId;
        const p =
          second === 20 ? peers.find((p) => p.client.id === hostId) : peers[(second / 5) % 5];
        const old = p.welcomes;
        p.client.socket.terminate();
        await until(() => p.welcomes > old);
        transitions++;
      }
      if (second % 15 === 0)
        console.log(
          JSON.stringify({
            progress: scenario,
            second,
            round: peers[0].client.round,
            phase: peers[0].client.latest.mission.phase,
            completed: results.length,
          }),
        );
    }
    clearInterval(timer);
    timer = null;
    const serverHeapEndMB = await heap();
    globalThis.gc?.();
    const final = {
      scenario,
      wallSeconds: Math.round((performance.now() - start) / 1000),
      pilots: 5,
      completedRounds: results,
      currentRound: peers[0].client.round,
      currentPhase: peers[0].client.latest.mission.phase,
      recoveries: transitions,
      spectatorActivations: observed,
      notices: noticeCount,
      bounds: max,
      serverHeapStartMB,
      serverHeapEndMB,
      clientHeapStartMB,
      clientHeapEndMB: mb(),
      maxParentDelayMs: Math.round(maxParentDelayMs),
      server: {
        samples: samples.length,
        minSimulationHz: Math.min(...samples.map((s) => s.simulationHz)),
        maxPhysicsP99Ms: Math.max(...samples.map((s) => s.physicsP99Ms)),
        maxSnapshotP95Ms: Math.max(...samples.map((s) => s.snapshotP95Ms)),
        maxGCPauseMs: Math.max(...samples.map((s) => s.maxGCPauseMs)),
        maxSchedulerDelayMs: Math.max(...samples.map((s) => s.maxSchedulerDelayMs)),
      },
      note: 'Real loopback transport and normal controls; server and five clients are separate processes. No renderer/audio; not an FPS test. Active rounds at the deadline are not counted as completed.',
    };
    console.log(JSON.stringify(final));
    return final;
  } finally {
    closing = true;
    clearInterval(timer);
    for (const p of peers) p.client.disconnect();
    if (child.connected) child.send({ type: 'stop' });
    const timeout = setTimeout(() => child.kill(), 3000);
    await once(child, 'exit');
    clearTimeout(timeout);
  }
}
if (process.argv[2] === '--server') await serverWorker();
else {
  const seconds = Number(process.argv[2] || 90),
    output = process.argv[3];
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 900)
    throw new Error('Duration must be 5..900 seconds per mode');
  const report = [];
  for (const mode of ['cooperative', 'arena']) report.push(await run(mode, seconds));
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
