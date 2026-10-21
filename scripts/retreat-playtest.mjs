import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { aircraft } from '../src/aircraftSpec.js';
import { Vec3 } from '../src/math.js';
import { createAircraft } from '../src/physics.js';
import { applyTargetHit, updateTargets } from '../src/targeting.js';
import { updateAIDefense } from '../src/aiDefense.js';
import { Weapons } from '../src/weapons.js';
export function retreatProbe({
  id = 'f16',
  heading = 0,
  speed = 250,
  base = true,
  seconds = 600,
} = {}) {
  const player = createAircraft(aircraft.find((a) => a.id === 'f16'));
  player.position = new Vec3(0, 2000, 0);
  const t = {
    id: 'R',
    kind: 'air',
    type: id === 'b52' ? 'bomber' : 'fighter',
    aircraftId: id,
    team: 'enemy',
    faction: 'east',
    alive: true,
    position: new Vec3(12000, 2500, 7000),
    velocity: new Vec3(Math.sin(heading) * speed, 0, Math.cos(heading) * speed),
    heading,
    cruiseSpeed: speed,
    radius: 28,
  };
  const bases = [
      {
        id: 'BASE',
        kind: 'ground',
        type: 'airbase',
        team: 'ally',
        alive: true,
        position: new Vec3(0, 0, 0),
      },
      ...(base
        ? [
            {
              id: 'HOME',
              kind: 'ground',
              type: 'airbase',
              team: 'enemy',
              alive: true,
              position: new Vec3(0, 0, 30000),
            },
          ]
        : []),
    ],
    w = new Weapons();
  applyTargetHit(t, 'gun', { amount: 40, part: 'weapons' });
  t.flight.condition.seed = 42;
  updateAIDefense(player, [t, ...bases], w, 0.01);
  let minHome = Infinity,
    minExit = Infinity,
    clock = 0;
  for (; clock < seconds && t.alive; clock += 1 / 120) {
    updateTargets([t], 1 / 120);
    minHome = Math.min(
      minHome,
      Math.hypot(t.position.x - t.retreat.home.x, t.position.z - t.retreat.home.z),
    );
    minExit = Math.min(
      minExit,
      Math.hypot(t.position.x - t.retreat.exit.x, t.position.z - t.retreat.exit.z),
    );
  }
  return {
    id,
    heading,
    speed,
    base,
    retired: !!t.retired,
    crashed: !!t.flight.crashed,
    stage: t.retreat.stage,
    duration: clock,
    minHome,
    minExit,
    position: t.position,
  };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = [];
  for (const id of ['f16', 'b52'])
    for (const base of [true, false])
      for (const heading of [0, Math.PI / 2, Math.PI, Math.PI * 1.5])
        rows.push(retreatProbe({ id, base, heading }));
  const text = JSON.stringify(rows, null, 2);
  if (process.argv[2]) await writeFile(process.argv[2], text);
  console.log(text);
}
