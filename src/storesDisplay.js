import { aircraftMesh } from './airframes.js';
import { armament, loadedStations, weaponKeys } from './armament.js';
import { faceDamagePart } from './hitGeometry.js';
import { clamp } from './math.js';
const partNames = {
  leftWing: 'Bal szárny',
  rightWing: 'Jobb szárny',
  tail: 'Vezérsíkok',
  fuselage: 'Törzs',
  engineLeft: 'Bal / egyetlen hajtómű',
  engineRight: 'Jobb hajtómű',
  hydraulics: 'Hidraulika',
  weapons: 'Fegyverrendszer',
};
export const integrityColor = (health) => `hsl(${Math.round(clamp(health, 0, 1) * 50)} 95% 53%)`;
const categories = { gun: 'GÉPÁGYÚ', aam: 'LÉGI RAKÉTA', agm: 'FÖLDI RAKÉTA', bomb: 'BOMBA' };
export function storesMarkup(s, selected, { compact = false } = {}) {
  const p = armament(s.spec),
    mesh = aircraftMesh(s.spec.id, 0);
  const zMin = Math.min(...mesh.points.map((p) => p.z)),
    zMax = Math.max(...mesh.points.map((p) => p.z));
  const scale = Math.min(
      112 / (zMax - zMin),
      180 / (2 * Math.max(...mesh.points.map((p) => Math.abs(p.x)))),
    ),
    cy = 66 + ((zMax + zMin) * scale) / 2;
  const xy = (point) =>
    `${(108 + point.x * scale).toFixed(1)},${(cy - point.z * scale).toFixed(1)}`;
  const silhouette = mesh.faces
    .map((face) => `M${face.map((i) => xy(mesh.points[i])).join('L')}Z`)
    .join('');
  const damage = mesh.faces
    .map((face, index) => {
      const part = faceDamagePart(mesh, index),
        engineIndex = mesh.faceEngines?.[index],
        integrity =
          engineIndex != null
            ? (s.condition?.engines?.[engineIndex] ?? 1)
            : (s.condition?.parts[part] ?? 1);
      if (integrity >= 0.995) return '';
      return `<path class="part-damage" data-part="${part}" d="M${face.map((i) => xy(mesh.points[i])).join('L')}Z" fill="${integrityColor(integrity)}" stroke="${integrityColor(integrity)}"><title>${engineIndex != null ? `${engineIndex + 1}. hajtómű` : partNames[part]} · állapot ${Math.round(integrity * 100)}%</title></path>`;
    })
    .join('');
  const lines = mesh.edges.map(([a, b]) => `M${xy(mesh.points[a])}L${xy(mesh.points[b])}`).join('');
  const stations = loadedStations(s)
    .map(
      (station) =>
        `<g class="store ${station.internal ? 'internal ' : ''}${station.loaded ? 'loaded' : 'empty'} ${station.type === selected ? 'selected' : ''}" transform="translate(${108 + station.x * scale} ${cy - station.z * scale})"><title>${p.weapons[station.type].name} · ${station.loaded ? 'felszerelve' : 'kioldva'}${station.internal ? ' · belső fegyvertér' : ''}</title><rect x="-2.5" y="-8" width="5" height="16" rx="2"/><path d="M-5 5H5"/></g>`,
    )
    .join('');
  const gun = p.weapons.gun
    ? `<circle class="store gun ${s.ammo.gun ? 'loaded' : 'empty'} ${selected === 'gun' ? 'selected' : ''}" cx="108" cy="${cy - zMax * scale * 0.65}" r="3"><title>${p.weapons.gun.name} · beépített gépágyú</title></circle>`
    : '';
  let rows = Object.entries(p.weapons)
    .map(
      ([type, w]) =>
        `<button type="button" data-weapon="${type}" class="store-option ${type === selected ? 'selected' : ''}" aria-pressed="${type === selected}" ${s.ammo[type] ? '' : 'disabled'} title="${categories[type]}"><kbd>${weaponKeys[type]}</kbd><span>${w.name}</span><b>${s.ammo[type]}</b></button>`,
    )
    .join('');
  if (p.tailGun)
    rows += `<div class="store-option ${s.rearView ? 'selected' : ''}" title="Külön farokgépágyú-lőszer"><kbd>V</kbd><span>Farokgépágyú</span><b>${s.ammo.tailGun || 0}</b></div>`;
  const minX = Math.min(...mesh.points.map((p) => 108 + p.x * scale)),
    maxX = Math.max(...mesh.points.map((p) => 108 + p.x * scale)),
    box = compact
      ? `${minX - 8} ${cy - zMax * scale - 8} ${maxX - minX + 16} ${(zMax - zMin) * scale + 16}`
      : '0 0 216 136';
  const health = Math.max(0, Math.round(100 - s.damage));
  return `<div class="stores-heading"><span>FEGYVERZET / ÁLLAPOT</span><small>${p.variant}</small></div><svg viewBox="${box}" role="img" aria-label="${p.variant} sematikus felülnézet; sérült részek sárgától pirosig"><path class="stores-silhouette" d="${silhouette}"/>${damage}<path class="stores-airframe" d="${lines}"/>${s.training ? '' : stations}${s.training ? '' : gun}</svg><div class="stores-health"><span>GÉP ÁLLAPOTA</span><b style="color:${s.damage ? integrityColor(health / 100) : '#c4ef96'}">${health}%</b></div><div class="store-options">${s.training ? '<small>FEGYVERZET NÉLKÜL</small>' : rows}</div>`;
}
let signature = '';
export function updateStores(s, weapons, options = {}) {
  const next = JSON.stringify([
    s.spec.id,
    !!options.compact,
    !!s.training,
    weapons.selected,
    !!s.rearView,
    s.ammo,
    Math.round(s.damage),
    [...Object.values(s.condition?.parts || {}), ...(s.condition?.engines || [])].map((v) =>
      Math.round(v * 100),
    ),
  ]);
  if (next === signature) return;
  signature = next;
  document.getElementById('stores-display').innerHTML = storesMarkup(s, weapons.selected, options);
}
