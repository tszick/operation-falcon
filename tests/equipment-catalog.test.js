import test from 'node:test';
import assert from 'node:assert/strict';
import {
  equipmentCatalog,
  catalogEntry,
  catalogLabel,
  equipmentLabel,
  renameEquipmentText,
} from '../src/equipmentCatalog.js';
import { aircraft } from '../src/aircraftSpec.js';
import { aiAircraft } from '../src/heavyAircraftData.js';
import { experimentalAircraft } from '../src/experimentalAircraft.js';
import { trainingAircraft } from '../src/trainingAircraft.js';
import { armament, armaments } from '../src/armament.js';
import { weaponEntries, countermeasureEntries } from '../src/weaponLibrary.js';
import { weaponProfile } from '../src/weaponDynamics.js';
import { unitTypes } from '../src/unitTypes.js';
import { setLanguage, tr } from '../src/i18n.js';
import { createAircraft } from '../src/physics.js';
import { storesMarkup } from '../src/storesDisplay.js';
const allAircraft = [
  ...new Map(
    [...aircraft, ...aiAircraft, ...experimentalAircraft, trainingAircraft].map((a) => [a.id, a]),
  ).values(),
];
test('every aircraft, installed weapon, defensive system and unit has a unique fictional catalogue identity', () => {
  const codes = new Set(),
    identities = new Set(),
    nicknames = new Set();
  for (const e of equipmentCatalog) {
    assert.match(e.code, /^(?:US|UK|FR|DE|SE|SU|RU|CN|EU|OF|CIV)-[A-Z]+-\d{3}$/);
    assert.ok(!codes.has(e.code), e.code);
    codes.add(e.code);
    assert.ok(!identities.has(e.kind + ':' + e.id));
    identities.add(e.kind + ':' + e.id);
    assert.ok(!nicknames.has(e.nickname), e.nickname);
    nicknames.add(e.nickname);
  }
  for (const a of allAircraft) assert.ok(catalogEntry('aircraft', a.id), a.id);
  for (const w of weaponEntries) assert.ok(catalogEntry('weapon', w.id), w.id);
  for (const cm of countermeasureEntries) assert.ok(catalogEntry('countermeasure', cm.id), cm.id);
  for (const id of Object.keys(unitTypes)) assert.ok(catalogEntry('unit', id), id);
});
test('legacy names, national variants and historical log labels resolve in either language without altering IDs', () => {
  for (const lang of ['hu', 'en']) {
    setLanguage(lang, { persist: false });
    for (const a of allAircraft) assert.equal(tr(a.name), catalogLabel('aircraft', a.id), a.id);
    assert.equal(tr('F-16C'), 'US-MR-101 (Skywarden)');
    assert.equal(tr('F/A-18C Hornet'), 'US-MR-102 (Seawing)');
    assert.equal(tr('AGM-65D Maverick'), 'US-AGM-201 (Stonepiercer)');
    assert.equal(tr('RIM-7 Sea Sparrow'), 'US-SAM-101 (Seawatch)');
  }
  setLanguage('hu', { persist: false });
  assert.equal(aircraft.find((a) => a.id === 'f16').id, 'f16');
  assert.equal(armaments.f16.variant, 'F-16C');
});
test('public names are idempotent, preserve call signs and numbers, and match whole legacy names first', () => {
  const text = 'F-15E Strike Eagle / F-15 Eagle / AIM-120C AMRAAM / R-77-1';
  const result = renameEquipmentText(text);
  assert.equal(renameEquipmentText(result), result);
  assert.equal(
    renameEquipmentText('Falcon One · Viper Two · Ironfist Three'),
    'Falcon One · Viper Two · Ironfist Three',
  );
  assert.equal(renameEquipmentText('xxF-16yy'), 'xxF-16yy');
  assert.equal(renameEquipmentText('F–16   Fighting Falcon'), 'US-MR-101 (Skywarden)');
  assert.ok(!/Strike Eagle|AMRAAM|R-77/.test(result));
  assert.equal(renameEquipmentText('M61A1 · 20 mm', { compact: true }), 'US-GUN-101 · 20 mm');
});
test('all names used by the equipment loadout and weapon library have migrated, while real firing profiles stay intact', () => {
  for (const a of allAircraft.filter((a) => armaments[a.id])) {
    const p = armament(a);
    for (const [type, w] of Object.entries(p.weapons)) {
      assert.match(renameEquipmentText(w.name), /[A-Z]+-[A-Z]+-\d{3}/, w.name);
      assert.ok(weaponProfile(a, type), a.id + ':' + type);
    }
    if (p.tailGun) assert.match(renameEquipmentText(p.tailGun.name), /[A-Z]+-GUN-\d{3}/);
  }
  for (const e of weaponEntries)
    for (const name of e.aliases || [e.name])
      assert.match(renameEquipmentText(name), /[A-Z]+-[A-Z]+-\d{3}/, name);
});
test('compact flight panels use readable short codes and generic targets resolve through the shared catalogue', () => {
  const spec = aircraft.find((a) => a.id === 'f16'),
    s = createAircraft(spec),
    html = storesMarkup(s, 'aam', { compact: true });
  assert.ok(html.includes('US-MR-101'));
  assert.ok(html.includes('US-AAM-101'));
  assert.ok(!html.includes('Skywarden') && !html.includes('Spark'));
  assert.equal(
    equipmentLabel({ aircraftId: 'mig29', name: 'MiG-29 Fulcrum' }, { compact: true }),
    'SU-MR-201',
  );
  assert.equal(
    equipmentLabel({ type: 'sam-system', name: 'Légvédelmi rakétarendszer' }),
    'OF-SAM-201 (Skyshield)',
  );
  assert.equal(catalogLabel('unit', 'tanker'), catalogLabel('aircraft', 'kc135'));
});

test('legacy Hungarian inflections and English plurals do not leave branded nicknames in descriptions', () => {
  setLanguage('hu', { persist: false });
  assert.equal(tr('T-45C Goshawkkal'), 'US-TRN-101 (Daybreak) géppel');
  assert.equal(tr('A Harriernek nincs'), 'A US-ATK-104 (Hoverwing) gépnek nincs');
  setLanguage('en', { persist: false });
  assert.equal(
    renameEquipmentText('Harriers land vertically'),
    'US-ATK-104 (Hoverwing) aircraft land vertically',
  );
  setLanguage('hu', { persist: false });
});
