import { aircraft, missionAircraftChoices, suitability } from './aircraftSpec.js';
// Keep all simulation types available to AI and the encyclopedia. The player's
// briefing roster follows the chosen coalition, mission compatibility and suitability.
export function plannerAircraft(mission) {
  const rank = { good: 0, ok: 1, bad: 2 };
  return (
    mission.side === 'east' && mission.naval
      ? aircraft.filter((a) => a.faction !== 'west')
      : missionAircraftChoices(mission)
  )
    .filter(
      (spec) =>
        (mission.side === 'east' ? spec.faction !== 'west' : spec.faction === 'west') &&
        (!mission.mirrored || !spec.transport) &&
        suitability(spec, mission) !== 'bad',
    )
    .sort(
      (a, b) =>
        rank[suitability(a, mission)] - rank[suitability(b, mission)] ||
        a.name.localeCompare(b.name, 'hu'),
    );
}
