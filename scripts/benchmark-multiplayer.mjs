import { performance } from 'node:perf_hooks';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import { Vec3 } from '../src/math.js';
import { neutralAxes, SNAPSHOT_BYTES_LIMIT } from '../src/multiplayer/protocol.js';
const percentile = (list, fraction) =>
  [...list].sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor(list.length * fraction))];
for (const mode of ['arena', 'defend-base']) {
  const rooms = new MultiplayerRooms(),
    room = rooms.create(mode === 'arena' ? 'arena' : 'cooperative');
  const pilots = Array.from({ length: 5 }, (_, i) => rooms.join(room, i % 2 ? 'fa18' : 'f16'));
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
  let maxFullBytes = 0;
  let maxBytes = 0,
    cursor = 0;
  for (let i = 0; i < 4800; i++) {
    for (const p of pilots)
      rooms.inputs(p, [
        {
          seq: p.received + 1,
          axes: { ...neutralAxes(), throttle: 0 },
          toggles: [],
          combat: {
            weapon: 'gun',
            fire: i % 4 === 0,
            cycle: i % 120 === 0,
            countermeasures: false,
          },
        },
      ]);
    const begin = performance.now();
    rooms.step();
    const end = performance.now();
    if (i >= 120) step.push(end - begin);
    if (i % 6 === 0) {
      const before = performance.now(),
        json = rooms.serialize(room, cursor);
      if (i >= 120) encoding.push(performance.now() - before);
      maxFullBytes = Math.max(maxFullBytes, Buffer.byteLength(rooms.serialize(room)));
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

  console.log(
    JSON.stringify({
      mode,
      pilots: 5,
      simulatedSeconds: room.mission.elapsedTicks / 120,
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
    }),
  );
}
