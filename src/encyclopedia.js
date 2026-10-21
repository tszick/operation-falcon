import { nationalityMarkup } from './aircraftNations.js';
import { escapeHtml as escape } from './ui/html.js';
import { trainingAircraft, trainerReferences } from './trainingAircraft.js';
import { defensiveGunRows } from './defensiveGunnery.js';
import { strategicArticles } from './strategicLibrary.js';
import { groundCombatRows } from './unitCombat.js';
import { weaponEntries, countermeasureEntries, weaponLibraryRows } from './weaponLibrary.js';
import { weaponPreviewMesh } from './weaponPreview.js';
import { pilotEntries, friendlyEntries, pilotMarkup, friendlyMissionRows } from './pilotLibrary.js';
import { unitTypes } from './unitTypes.js';
import { aircraft, transportAircraft } from './aircraftSpec.js';
import { renderAircraftPreview, renderTargetPreview } from './renderer.js';
import { armament } from './armament.js';
import { threatTypes } from './threats.js';
const embedded = new URLSearchParams(location.search).get('embedded') === '1';
if (embedded) document.body.classList.add('embedded-library');
const $ = (id) => document.getElementById(id),
  player = aircraft.find((a) => a.id === 'f16');
const entries = [
  ...pilotEntries,
  ...friendlyEntries,
  ...Object.entries(unitTypes).map(([id, unit]) => ({
    id,
    unit,
    kind: unit.kind,
    name: unit.name,
    category: unit.category,
  })),
  ...[
    ['b52', 'B-52 Stratofortress', 'bomber'],
    ['tu95', 'Tu-95 Bear', 'bomber'],
    ['c130', 'C-130 Hercules', 'transport'],
    ['il76', 'Il-76 Candid', 'transport'],
  ]
    .filter(([id]) => ![...aircraft, ...transportAircraft].some((a) => a.id === id))
    .map(([id, name, type]) => ({
      id,
      name,
      modelId: id,
      unit: unitTypes[type],
      kind: 'air',
      category: unitTypes[type].category,
    })),
  ...[...aircraft, ...transportAircraft, trainingAircraft].map((spec) => ({
    id: spec.id,
    spec,
    kind: 'air',
    name: spec.name,
    category: spec.trainingOnly
      ? 'Kizárólag gyakorlópályákon'
      : spec.faction !== 'west'
        ? 'Keleti repülőgép · oldaltól és feladattól függően választható'
        : spec.transport
          ? 'Szállítós küldetésen választható'
          : 'Nyugati repülőgép · küldetéstől függően választható',
  })),
  ...weaponEntries,
  ...countermeasureEntries,
];

function hashId() {
  try {
    return decodeURIComponent(location.hash.slice(1));
  } catch {
    return '';
  }
}
let selected = entries.find((e) => e.id === hashId()) || entries[0];
if (location.hash && !embedded) $('library-filter').value = selected.kind;
function list() {
  const filter = $('library-filter').value;
  $('library-list').innerHTML = entries
    .filter((e) => filter === 'all' || e.kind === filter)
    .map(
      (e) =>
        `<button data-unit="${escape(e.id)}" aria-pressed="${e === selected}">${escape(e.name)}<small>${escape(e.category)}</small></button>`,
    )
    .join('');
}
function relatedIds(entry) {
  if (['harrier', 'carrier', 'destroyer'].includes(entry.id))
    return ['guide-carrier', 'carrier', 'destroyer', 'harrier', 'weapon-seaSparrow'].filter(
      (id) => id !== entry.id,
    );
  if (entry.id === 'target-range' || entry.id === 't45')
    return [
      'guide-practice-bombing',
      't45',
      'target-range',
      'weapon-mk76',
      'guide-takeoff',
      'guide-landing',
    ].filter((id) => id !== entry.id);
  if (strategicArticles[entry.id]) return strategicArticles[entry.id].related;
  if (entry.related) return entry.related;
  if (entry.kind === 'weapon')
    return [
      entry.type === 'aam'
        ? 'guide-air-combat'
        : entry.type === 'gun'
          ? 'guide-aiming'
          : entry.type === 'bomb'
            ? 'guide-ground-object'
            : 'guide-ground-unit',
    ];
  if (entry.kind === 'countermeasure') return ['guide-air-combat', 'guide-damage'];
  if (entry.spec)
    return entry.spec.transport
      ? ['guide-transport-flight', 'transport', 'guide-landing']
      : ['guide-takeoff', 'guide-landing'];
  return entry.kind === 'air'
    ? ['guide-intercept', 'guide-air-combat']
    : ['guide-ground-object', 'guide-ground-unit'];
}
function detail() {
  $('unit-category').textContent = selected.category;
  $('unit-name').textContent = selected.name;
  $('unit-nationality').innerHTML = selected.spec ? nationalityMarkup(selected.spec) : '';
  $('unit-art').hidden = selected.kind === 'guide';
  $('unit-art').setAttribute('aria-label', selected.name + ' forgó térbeli előnézete');
  const extra = strategicArticles[selected.id],
    article = selected.kind === 'guide' || selected.kind === 'friendly' || !!extra;
  $('pilot-body').hidden = !article;
  $('pilot-body').innerHTML = extra
    ? extra.sections
        .map(
          (section) =>
            `<section><h3>${escape(section.title)}</h3>${section.paragraphs.map((text) => `<p>${escape(text)}</p>`).join('')}</section>`,
        )
        .join('') +
      `<section><h3>Forrás az elnevezéshez</h3><p><a href="${escape(extra.reference.url)}" target="_blank" rel="noopener">${escape(extra.reference.title)} ↗</a></p></section>`
    : article
      ? pilotMarkup(selected)
      : '';
  let rows = [];
  if (selected.kind === 'guide') {
    $('unit-description').textContent = selected.description;
  } else if (selected.kind === 'friendly') {
    const u = unitTypes[selected.type];
    $('unit-description').textContent = selected.description;
    rows = [
      ['Oldal', 'Szövetséges / kék jelölés'],
      ['Típus', u.name],
      ['Fegyverek', u.weapons.map((w) => threatTypes[w].name).join(' · ') || 'Fegyvertelen'],
      ['Vezérlés', 'Önálló gépi vezérlés; a játékos csak a saját repülőjét irányítja'],
      ...groundCombatRows(selected.type),
      ...friendlyMissionRows(selected),
    ];
  } else if (selected.kind === 'weapon' || selected.kind === 'countermeasure') {
    $('unit-description').textContent = selected.description;
    rows = weaponLibraryRows(selected);
  } else if (selected.spec) {
    const a = selected.spec,
      preset = armament(a);
    $('unit-description').textContent =
      `${a.role}. ${preset.variant}. ${a.transport ? 'Védd meg a szállítógépet vagy a Vasfátyol szállítós szakasza. A két kísérő vadász téged véd. A 45 km-es taktikai érzékelő, a repülési együtthatók, a teher nélküli kiindulás és az önvédelmi készlet játékbeli közelítés; nem hitelesített teljesítménytáblázat. ' : ''} ${a.trainingOnly ? 'A négy gyakorlópálya rögzített gépe. Nincs utánégető vagy harci fegyverzet. A civil elfogáshoz VMTS jellegű szimulált kontaktokat mutatunk, nem valódi fedélzeti harci radart. A tolóerő, méretek és üres tömeg nyilvános típusadatok; a légellenállási, felhajtóerő- és kormányegyütthatók játékbeli közelítések. ' : ''}Ugyanaz a térbeli modell és fegyverkészlet szerepel az adatlapon és a repülésben.`;
    rows = [
      ['Szerep', a.role],
      ['Maximális sebesség', `Mach ${a.maxMach.toFixed(2)}`],
      ['Terhelési határ', `${a.maxG} G`],
      ['Üres tömeg', `${a.emptyMass.toLocaleString('hu')} kg`],
      ['Üzemanyag', `${a.fuelCapacity.toLocaleString('hu')} kg`],
      [
        a.syntheticRadar ? 'Szimulált kiképzési érzékelő' : 'Radar',
        `${a.radarRange / 1000} km · ${a.radarCone}° félkúp`,
      ],
      ['Csúcsmagasság', `${a.ceiling / 1000} km`],
      [
        'Fegyverzet',
        [...Object.values(preset.weapons), ...(preset.tailGun ? [preset.tailGun] : [])]
          .map((w) => `${w.name} × ${w.quantity}`)
          .join(' · '),
      ],
      ...defensiveGunRows(a.id),
      ...(a.vtol
        ? [
            [
              'Fedélzeti üzem',
              'Z: 0° / 45° / 90° fúvócső. Függőleges le- és felszállás tömegkorláttal; nincs katapult vagy fékezőhorog.',
            ],
            ['Hajtómű', '1 × Pegasus F402-RR-408A · kb. 98,75 kN · utánégető nélkül'],
            ['Méret', '14,12 m hossz · 9,25 m fesztáv'],
            ['Forrás', 'https://www.navair.navy.mil/product/AV-8B-Harrier'],
            [
              'Közelítés',
              'A repülési együtthatók és lebegési reakciók játékmodell, nem hitelesített repülési kézikönyv.',
            ],
          ]
        : []),
      ...(a.transport
        ? [
            [
              'Küldetésszerep',
              'A játékos a védendő szállító; két baráti vadász kíséri. Kijutás után hazatérés és leszállás.',
            ],
            ['Önvédelem', 'Véges infracsapda és dipólköteg; C / 5 / 6. Harci fegyver nincs.'],
            [
              'Paraméterek',
              'A típus méretei és hajtómű-elrendezése alapján készült közelítő játékmodell; a légcsavaros gépeknél ekvivalens tolóerőt használunk.',
            ],
            [
              'Típusforrás',
              a.id.startsWith('c130')
                ? 'https://www.af.mil/About-Us/Fact-Sheets/Display/Article/1555054/c-130-hercules/'
                : a.id.startsWith('il76')
                  ? 'https://uacrussia.ru/en/aircraft/lineup/l/IL-76MD-90A/'
                  : 'https://eng.chinamil.com.cn/CHINA_209163/TopStories_209189/10215713.html',
            ],
          ]
        : []),
      ...(a.trainingOnly
        ? [
            ['Hajtómű', '1 × Rolls-Royce F405-RR-401 · 24,6 kN · utánégető nélkül'],
            ['Fesztáv / hossz', '9,39 m / 11,98 m'],
            ['Szárnyfelület', `${a.wingArea} m²`],
            [
              'Fegyverzet a gyakorlatokon',
              '1–3. pálya: fegyvertelen; 4. pálya: pontosan 3 inert Mk 76',
            ],
            ['Használható JP-5 üzemanyag', '2904 lb ≈ 1317 kg · CNATRA oktatási kézikönyv'],
            [
              'Gyakorlófüggesztés',
              'Három bombalőszer egy szárny alatti gyakorlófüggesztőn; nem három külön géppilon.',
            ],
            ['Konfiguráció forrása', trainerReferences[2][1]],
            ['Típusadat forrása', trainerReferences[0][1]],
            ['Gyakorlóbomba alkalmazása', trainerReferences[1][1]],
          ]
        : []),
    ];
  } else {
    const u = selected.unit;
    $('unit-description').textContent = u.description;
    rows = [
      ['Osztály', u.category],
      ['Feladat', u.role],
      ['Fegyverek', u.weapons.map((w) => threatTypes[w].name).join(' · ') || 'Nem tüzel'],
      ...(u.health ? [['Szerkezeti pont', u.health]] : []),
      ...(u.speed
        ? [[u.speedLabel || 'Haladási sebesség', `${Math.round(u.speed * 3.6)} km/h`]]
        : []),
      ...(u.range ? [['Zavarási sugár', `${u.range / 1000} km`]] : []),
      ...(u.size ? [['Kiterjedés', u.size]] : []),
      ...groundCombatRows(selected.type || selected.id),
      ...defensiveGunRows(selected.id),
      ...(extra?.rows || []),
      ['Irányítás', 'Gépi vezérlés, a küldetésben kiosztott oldalon'],
    ];
  }
  $('unit-table').hidden = !rows.length;
  $('unit-data').innerHTML = rows
    .map(([key, value]) => `<tr><th scope="row">${escape(key)}</th><td>${escape(value)}</td></tr>`)
    .join('');
  $('library-related').innerHTML = relatedIds(selected)
    .map((id) => entries.find((e) => e.id === id))
    .filter(Boolean)
    .map((e) => `<button data-entry-link="${escape(e.id)}">${escape(e.name)} ↗</button>`)
    .join('');
  list();
}
function choose(id, { scroll = true } = {}) {
  selected = entries.find((e) => e.id === id) || entries[0];
  const filter = $('library-filter');
  if (filter.value !== 'all' && filter.value !== selected.kind) filter.value = selected.kind;
  history.replaceState(null, '', '#' + encodeURIComponent(selected.id));
  detail();
  if (scroll) document.querySelector('.library-detail').scrollIntoView({ block: 'start' });
}
$('library-list').onclick = (e) => {
  const button = e.target.closest('[data-unit]');
  if (button) choose(button.dataset.unit);
};
$('library-related').onclick = (e) => {
  const button = e.target.closest('[data-entry-link]');
  if (button) choose(button.dataset.entryLink);
};
$('library-filter').onchange = () => {
  const filter = $('library-filter').value;
  if (filter !== 'all' && selected.kind !== filter)
    selected = entries.find((e) => e.kind === filter) || selected;
  choose(selected.id, { scroll: false });
};
addEventListener('hashchange', () => choose(hashId(), { scroll: false }));
function frame(time) {
  if (selected.kind !== 'guide') {
    const t = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : time / 1000;
    if (selected.kind === 'weapon' || selected.kind === 'countermeasure')
      renderAircraftPreview($('unit-art'), selected, t, weaponPreviewMesh(selected));
    else if (selected.modelId) renderAircraftPreview($('unit-art'), { id: selected.modelId }, t);
    else if (selected.kind === 'friendly')
      renderTargetPreview(
        $('unit-art'),
        { id: selected.type, kind: unitTypes[selected.type].kind },
        player,
        t,
      );
    else if (selected.spec) renderAircraftPreview($('unit-art'), selected.spec, t);
    else renderTargetPreview($('unit-art'), { id: selected.id, kind: selected.kind }, player, t);
  }
  requestAnimationFrame(frame);
}
detail();
requestAnimationFrame(frame);
