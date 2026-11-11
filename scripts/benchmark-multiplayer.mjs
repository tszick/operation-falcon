import { performance } from 'node:perf_hooks';
import { compressSnapshot } from '../server/snapshot-transport.mjs';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import { packControlBatch } from '../src/multiplayer/controlWire.js';
import { seededRandom } from '../src/oceanEnvironment.js';
import { createRoomCombat } from '../server/multiplayer-combat.mjs';
import { Vec3 } from '../src/math.js';
import { neutralAxes, SNAPSHOT_BYTES_LIMIT } from '../src/multiplayer/protocol.js';
import { writeFile } from 'node:fs/promises';
const reports = [];
const percentile = (list, fraction) =>
  [...list].sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor(list.length * fraction))];
const nativeRandom = Math.random;
for (const mode of ['arena', 'defend-base']) {
  Math.random = seededRandom(771);
  const rooms = new MultiplayerRooms(),
    room = rooms.create(mode === 'arena' ? 'arena' : 'cooperative');
  room.world.skySeed = 771;
  room.combat = createRoomCombat(room.world, mode === 'arena' ? 'arena' : 'cooperative');
  const pilots = Array.from({ length: 5 }, (_, i) => rooms.join(room, i % 2 ? 'fa18' : 'f16'));
  pilots.forEach((p, i) => {
    p.spawnSeed = 100 + i;
  });
  if (mode === 'defend-base')
    rooms.preflight(room, pilots[0], {
      type: 'mission',
      revision: room.lobby.revision,
      missionId: mode,
    });
  for (const p of pilots)
    rooms.preflight(room, p, { type: 'ready', revision: room.lobby.revision, ready: true });
  rooms.preflight(room, pilots[0], { type: 'start', revision: room.lobby.revision });
  if (mode === 'defend-base')
    pilots.forEach((p, i) => {
      p.state.position = new Vec3(i * 300, 3000, -8000);
      p.state.previousPosition = p.state.position.clone();
      p.state.velocity = new Vec3(0, 0, 180);
      p.state.onGround = false;
      p.state.airborne = true;
      p.state.gear = false;
      p.state.flaps = false;
      p.state.flapPosition = 0;
    });
  const step = [],
    encoding = [];
  let totalBytes = 0,
    totalRawBytes = 0,
    samples = 0,
    wireMs = 0,
    rawMs = 0;
  const uplink = pilots.map(() => []);
  let upRawBytes = 0,
    upWireBytes = 0,
    maxWireBytes = 0;
  let maxFullBytes = 0;
  let maxBytes = 0,
    cursor = 0;
  for (let i = 0; i < 4800; i++) {
    for (const [index, p] of pilots.entries()) {
      const command = {
        seq: p.received + 1,
        axes: { ...neutralAxes(), throttle: 0 },
        toggles: [],
        combat: {
          weapon: 'gun',
          fire: i % 4 === 0,
          cycle: i % 120 === 0,
          countermeasures: false,
        },
      };
      uplink[index].push(command);
      rooms.inputs(p, [command]);
    }

    const begin = performance.now();
    rooms.step();
    const end = performance.now();
    if (i >= 120) step.push(end - begin);
    if (i % 6 === 0) {
      const before = performance.now();
      const packet = rooms.wireSnapshot
        ? compressSnapshot(rooms.wireSnapshot(room, cursor))
        : rooms.serialize(room, cursor);
      const duration = performance.now() - before;
      wireMs += duration;
      if (i >= 120) encoding.push(duration);
      const rawStart = performance.now();
      const json = rooms.wireSnapshot ? rooms.serialize(room, cursor) : packet;
      rawMs += rooms.wireSnapshot ? performance.now() - rawStart : duration;
      maxFullBytes = Math.max(maxFullBytes, Buffer.byteLength(rooms.serialize(room)));
      const size = typeof packet === 'string' ? Buffer.byteLength(packet) : packet.byteLength;
      // Server WebSocket frames are unmasked; these payloads use a four-byte frame header.
      totalBytes += size + (size < 126 ? 2 : size <= 65535 ? 4 : 10);
      totalRawBytes += Buffer.byteLength(json);
      maxWireBytes = Math.max(maxWireBytes, size);
      samples++;
      for (const commands of uplink) {
        const raw = JSON.stringify({ type: 'input', round: room.round, commands });
        const compact = JSON.stringify({
          type: 'input',
          round: room.round,
          packed: packControlBatch(commands),
        });
        upRawBytes += Buffer.byteLength(raw) + 8;
        upWireBytes += Buffer.byteLength(rooms.wireSnapshot ? compact : raw) + 8;
        commands.length = 0;
      }
      cursor = room.combat.eventSequence;
      maxBytes = Math.max(maxBytes, Buffer.byteLength(json));
    }
  }
  if (maxFullBytes + 512 > SNAPSHOT_BYTES_LIMIT) throw new Error('Snapshot exceeds network budget');
  const copied = [],
    wire = [];
  for (let i = 0; i < 150; i++) {
    const a = performance.now(),
      old = JSON.stringify(rooms.snapshot(room));
    const b = performance.now(),
      current = rooms.serialize(room),
      c = performance.now();
    if (old !== current) throw new Error('Serialization changed the game state packet');
    if (i >= 30) {
      copied.push(b - a);
      wire.push(c - b);
    }
  }

  const report = {
    mode,
    samples,
    totalBytes,
    totalRawBytes,
    upRawBytes,
    upWireBytes,
    meanClientUpKiBps: upWireBytes / pilots.length / 40 / 1024,
    maxWireBytes,
    meanClientKiBps: ((totalBytes / samples) * 20) / 1024,
    meanClientGiBPerHour: ((totalBytes / samples) * 20 * 3600) / 1024 ** 3,
    encodeMeanMs: wireMs / samples,
    rawEncodeMeanMs: rawMs / samples,
    serverBusyPercent:
      ((step.reduce((a, b) => a + b, 0) / step.length) * 120 + (wireMs / samples) * 20) / 10,
    pilots: 5,
    simulatedSeconds: room.mission.elapsedTicks / 120,
    finalAuthority: {
      phase: room.mission.phase,
      events: room.combat.eventSequence,
      projectiles: room.combat.weapons.projectiles.length,
      pilots: pilots.map((p) => ({
        ack: p.ack, position: p.state.position, velocity: p.state.velocity,
        orientation: p.state.orientation, damage: p.state.damage,
        ammo: p.state.ammo, fuel: p.state.fuel, crashed: p.state.crashed,
      })),
      targets: room.combat.targets.map((t) => ({
        id: t.id, alive: t.alive, health: t.health,
        position: t.position, damage: t.flight?.damage,
      })),
    },
    physicsMeanMs: step.reduce((a, b) => a + b, 0) / step.length,
    physicsP95Ms: percentile(step, 0.95),
    physicsP99Ms: percentile(step, 0.99),
    snapshotP95Ms: percentile(encoding, 0.95),
    copiedSnapshotP95Ms: percentile(copied, 0.95),
    directSnapshotP95Ms: percentile(wire, 0.95),
    maxSnapshotBytes: maxBytes,
    maxFullSnapshotBytes: maxFullBytes,
    perClientMaxKBps: Math.round((maxBytes * 20) / 1024),
    note: 'Server simulation and serialization only; not browser FPS.',
  };
  Math.random = nativeRandom;
  reports.push(report);
  console.log(JSON.stringify(report));
}
if (process.argv[2])
  await writeFile(
    process.argv[2],
    JSON.stringify({ phase: process.argv[3] || 'current', reports }, null, 2),
  );
