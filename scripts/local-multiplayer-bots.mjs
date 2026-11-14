import { decodeSnapshot } from '../src/multiplayer/binarySnapshot.js';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION, validRoomCode, neutralAxes } from '../src/multiplayer/protocol.js';
import { unpackFlight } from '../src/multiplayer/flightState.js';
import { Vec3 } from '../src/math.js';
import { combatFlightInput } from '../src/aiDefense.js';
const [code, duration = '45'] = process.argv.slice(2),
  seconds = Number(duration);
if (!validRoomCode(code) || !Number.isFinite(seconds) || seconds < 1 || seconds > 120)
  throw new Error('Usage: node scripts/local-multiplayer-bots.mjs ROOMCODE [1..120 seconds]');
// Deliberately fixed to loopback: this test cannot dial a remote server.
const origin = 'http://127.0.0.1:5174',
  peers = [];
let closing = false,
  sentBytes = 0,
  receivedBytes = 0;
for (let i = 0; i < 4; i++) {
  const p = { ws: new WebSocket('ws://127.0.0.1:5174/multiplayer', { origin }), seq: 0, ticks: 0 };
  peers.push(p);
  p.ws.on('open', () =>
    p.ws.send(
      JSON.stringify({
        type: 'hello',
        version: PROTOCOL_VERSION,
        mode: 'join',
        code,
        aircraftId: i % 2 ? 'fa18' : 'f16',
      }),
    ),
  );
  p.ws.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  p.ws.on('message', (data, binary) => {
    receivedBytes += data.byteLength;
    const msg = decodeSnapshot(binary ? data : data.toString());
    if (msg.type === 'error' && msg.code === 'lobby-changed') {
      p.readyRevision = null;
      return;
    }
    if (msg.type === 'error') {
      console.error('Local test pilot:', msg.code);
      p.ws.close();
      process.exitCode = 1;
      return;
    }
    if (msg.type === 'welcome') {
      p.id = msg.id;
      console.log('LOCALHOST pilot joined:', msg.players.find((q) => q.id === p.id).callSign);
    }
    if (!['welcome', 'snapshot'].includes(msg.type)) return;
    p.snapshot = msg;
    const own = msg.players.find((q) => q.id === p.id);
    if (!own) return;
    if (p.round !== msg.round) {
      p.round = msg.round;
      p.seq = own.ack;
      p.ticks = 0;
      p.readyRevision = null;
    }
    p.state = unpackFlight(own.state);
    p.own = own;
    if (
      msg.mission?.phase === 'waiting' &&
      !msg.lobby.players.find((q) => q.id === p.id).ready &&
      p.readyRevision !== msg.lobby.revision
    ) {
      p.readyRevision = msg.lobby.revision;
      p.ws.send(JSON.stringify({ type: 'ready', revision: msg.lobby.revision, ready: true }));
    }
  });
}
const timer = setInterval(() => {
  for (const p of peers) {
    if (
      p.ws.readyState !== WebSocket.OPEN ||
      !p.state ||
      (p.snapshot.mission && p.snapshot.mission.phase !== 'active')
    )
      continue;
    const s = p.state,
      targetId = p.own.combat.aim.id,
      targets = [
        ...p.snapshot.players.map((q) => ({ id: q.id, kind: 'air', ...q.state })),
        ...p.snapshot.combat.targets,
      ];
    const target = targets.find((q) => q.id === targetId),
      goal = target && new Vec3(target.position.x, target.position.y, target.position.z);
    const controls = s.onGround
      ? { ...neutralAxes(), throttle: 1, pitch: s.ias > 78 ? 0.18 : 0 }
      : goal
        ? {
            ...neutralAxes(),
            ...combatFlightInput({
              flight: s,
              cruiseSpeed: 200,
              navigationGoal: { kind: 'air', position: goal },
            }),
          }
        : neutralAxes();
    const axes = { ...neutralAxes(), ...controls };
    for (const key of ['pitch', 'roll', 'yaw', 'throttle'])
      axes[key] = Math.max(-1, Math.min(1, axes[key] || 0));
    axes.brake = !!axes.brake;
    const weapon = s.ammo.aam ? 'aam' : 'gun',
      fire =
        weapon === 'aam' ? p.own.combat.aim.locked : !!goal && s.position.distance(goal) < 1200;
    const commands = Array.from({ length: 6 }, () => {
      p.ticks++;
      return {
        seq: ++p.seq,
        axes,
        toggles: [],
        combat: {
          weapon,
          fire,
          cycle: !targetId && p.ticks % 120 === 0,
          countermeasures: s.incomingMissiles > 0 && p.ticks % 120 === 0,
        },
      };
    });
    if (s.gear && !s.onGround && s.agl > 130) commands[0].toggles.push('gear');
    if (s.flaps && !s.onGround && s.agl > 130) commands[0].toggles.push('flaps');
    const packet = JSON.stringify({ type: 'input', round: p.snapshot.round, commands });
    sentBytes += Buffer.byteLength(packet);
    p.ws.send(packet);
  }
}, 50);
const finish = () => {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  for (const p of peers) p.ws.close();
  console.log(
    JSON.stringify({
      loopbackOnly: true,
      seconds,
      sentBytes,
      receivedBytes,
      joined: peers.filter((p) => p.id).length,
    }),
  );
};
const deadline = setTimeout(finish, seconds * 1000);
process.on('SIGINT', () => {
  clearTimeout(deadline);
  finish();
});
