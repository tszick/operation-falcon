import { plannerAircraft } from './plannerSelection.js';
import { missionForSide, canChooseSide } from './missionSides.js';
import { aircraftSide } from './aircraftNations.js';
// Always build from the original mission: opposing roles can have different rosters.
export function catalogueAircraft(mission) {
  const west = plannerAircraft(missionForSide(mission, 'west'));
  if (!canChooseSide(mission)) return west;
  const groups = { soviet: 0, 'russia-modern': 1, 'china-modern': 2 };
  const east = plannerAircraft(missionForSide(mission, 'east'));
  east.sort((a, b) => (groups[a.group] ?? 0) - (groups[b.group] ?? 0));
  return [...west, ...east];
}
// Page boundaries never mix coalitions. A final short page keeps the remaining types.
export function cataloguePages(choices, pageSize = 3) {
  const size = pageSize === 6 ? 6 : 3;
  return ['west', 'east'].flatMap((side) => {
    const planes = choices.filter((a) => aircraftSide(a) === side),
      pages = [];
    for (let i = 0; i < planes.length; i += size)
      pages.push({ side, aircraft: planes.slice(i, i + size) });
    return pages;
  });
}
