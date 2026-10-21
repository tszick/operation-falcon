// Design/programme origin, not the nationality of every operator of the type.
export const nations = {
  us: 'Egyesült Államok',
  uk: 'Egyesült Királyság',
  fr: 'Franciaország',
  se: 'Svédország',
  de: 'Németország',
  it: 'Olaszország',
  es: 'Spanyolország',
  su: 'Szovjetunió',
  ru: 'Oroszország',
  cn: 'Kína',
};
const origins = {
  mirage: ['fr'],
  rafale: ['fr'],
  gripen: ['se'],
  euro: ['uk', 'de', 'it', 'es'],
  tornado: ['uk', 'de', 'it'],
  harrier: ['us', 'uk'],
  t45: ['us', 'uk'],
};
export const aircraftSide = (spec) => (spec.faction === 'west' ? 'west' : 'east');
export function aircraftNations(spec) {
  return (
    origins[spec.id] || [
      spec.group === 'soviet' || spec.id === 'tu95'
        ? 'su'
        : spec.faction === 'china'
          ? 'cn'
          : spec.faction === 'east'
            ? 'ru'
            : 'us',
    ]
  );
}
export function nationalityMarkup(spec, { flagsOnly = false } = {}) {
  const ids = aircraftNations(spec);
  return `<span class="aircraft-nationality"><span class="national-flags">${ids
    .map(
      (id) =>
        `<img src="/assets/flags/${id}.svg" alt="${nations[id]}" title="${nations[id]}" width="30" height="20" />`,
    )
    .join(
      '',
    )}</span>${flagsOnly ? '' : `<span>${ids.map((id) => nations[id]).join(' / ')}</span>`}</span>`;
}
