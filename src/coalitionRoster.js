import { aircraftFlightSpec } from './aiAircraftSpec.js';
const fighters = {
  soviet: ['mig29', 'su27', 'mig25', 'mig31'],
  russian: ['su35', 'su57'],
  chinese: ['j10', 'j20'],
};
export function assignCoalitionRoster(targets, player, rng = Math.random) {
  const east = targets.filter(
    (t) => t.kind === 'air' && !t.civilian && t.type !== 'ballistic' && t.faction !== 'west',
  );
  // There is no Chinese bomber model yet: homogeneous Chinese flights are fighter-only.
  const modes = east.some((t) => t.type === 'bomber' || t.type === 'transport')
    ? ['soviet', 'russian', 'mixed']
    : ['soviet', 'russian', 'chinese', 'mixed'];
  const mode = modes[Math.min(modes.length - 1, Math.floor(rng() * modes.length))];
  let index = 0;
  for (const t of targets) {
    if (
      t.kind !== 'air' ||
      t.civilian ||
      t.type === 'ballistic' ||
      t.type === 'tanker' ||
      t.playerControlled
    )
      continue;
    let id;
    if (t.faction === 'west')
      id = t.type === 'bomber' ? 'b52' : t.type === 'transport' ? 'c130' : t.aircraftId;
    else if (t.type === 'bomber') id = 'tu95';
    else if (t.type === 'transport') id = 'il76';
    else {
      const pool =
        mode === 'mixed'
          ? index % 2 === 0
            ? fighters.chinese
            : [...fighters.soviet, ...fighters.russian]
          : fighters[mode];
      index++;
      id = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    }
    if (t.faction === 'west' && aircraftFlightSpec(id).faction !== 'west') id = 'f15';
    const spec = aircraftFlightSpec(id);
    t.aircraftId = spec.id;
    t.faction = spec.faction;
    t.name = spec.name;
    t.coalition = spec.faction === 'west' ? 'west' : 'east';
    t.coalitionMode = mode;
    const expectedWest = (t.team === 'ally') === (player.faction === 'west');
    if ((spec.faction === 'west') !== expectedWest) throw new Error('Coalition mismatch: ' + t.id);
  }
}
