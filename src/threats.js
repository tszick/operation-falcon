import { unitDefinition } from './unitTypes.js';
export const threatTypes = {
  ballistic: { name: 'Interkontinentális csapás', path: 'M3 14L8 2L13 14M5 10H11M8 2V12' },
  bomb: { name: 'Bombavetés', path: 'M6 3L4 1M10 3L12 1M6 3H10V10L8 14L6 10ZM5 8H11' },
  jammer: {
    name: 'Radar / GPS jelzavaró',
    path: 'M8 8V15M4 15H12M6 6L8 8L10 6M4 4Q0 8 4 12M12 4Q16 8 12 12',
  },
  missile: { name: 'Követő rakéta', path: 'M3 13L11 5M7 5L12 4L11 9M2 9L6 10L7 14' },
  flak: {
    name: 'Légvédelmi robbanógránát',
    path: 'M8 1V4M8 12V15M1 8H4M12 8H15M3 3L5 5M11 11L13 13M3 13L5 11M11 5L13 3M6 8L8 6L10 8L8 10Z',
  },
  gun: { name: 'Gépágyú', path: 'M2 4H10M6 8H14M2 12H10' },
};
export const threatsFor = (id) => unitDefinition(id).weapons.filter((w) => w !== 'jammer');
export const missionThreatsFor = (m) => [
  ...new Set(
    (m.roster || [])
      .filter((r) => r.team === 'enemy')
      .flatMap((r) => unitDefinition(r.type).weapons),
  ),
];
export function threatMarkup(value) {
  const types =
    typeof value === 'string' ? unitDefinition(value).weapons : missionThreatsFor(value);
  return `<span class="mission-threat-icons">${types.map((type) => `<span class="threat-icon" role="img" aria-label="${threatTypes[type].name}" title="${threatTypes[type].name}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${threatTypes[type].path}"/></svg></span>`).join('')}</span>`;
}
