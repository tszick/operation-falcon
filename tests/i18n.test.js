import { pilotEntries, friendlyEntries } from '../src/pilotLibrary.js';
import { weaponEntries, countermeasureEntries } from '../src/weaponLibrary.js';
import { unitTypes } from '../src/unitTypes.js';
import { missions } from '../src/aircraftSpec.js';
import { missionForSide } from '../src/missionSides.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectLanguage, setLanguage, i18n, tr } from '../src/i18n.js';
import messages from '../src/locales/messages.json' with { type: 'json' };
import { radioLines } from '../src/radioLines.js';

test('language selection follows saved preference, browser variants and English fallback', () => {
  assert.equal(detectLanguage(null, ['hu-HU', 'en-US']), 'hu');
  assert.equal(detectLanguage(null, ['en-GB', 'hu-HU']), 'en');
  assert.equal(detectLanguage(null, ['de-DE', 'fr-FR']), 'en');
  assert.equal(detectLanguage('en', ['hu-HU']), 'en');
  assert.equal(detectLanguage('invalid', ['hu_HU']), 'hu');
});
test('live text translation handles templates, uppercase, markup fragments and switching back', () => {
  setLanguage('en', { persist: false });
  assert.equal(tr('Védd meg a repteret'), 'Defend the Airfield');
  assert.equal(tr('Támadók leküzdve: 2/4'), 'Attackers neutralized: 2/4');
  assert.equal(tr('BEFOGÁS 73%'), 'ACQUIRING 73%');
  assert.equal(tr('SZERKEZET 81%'), 'STRUCTURE 81%');
  assert.equal(tr('F-14 Tomcat'), 'F-14 Tomcat');
  assert.equal(tr('  250 km/h  '), '  250 km/h  ');
  const value = tr('KIJELÖLVE / Védd meg a repteret · Lappföld · Észak-Finnország');
  assert.ok(value.startsWith('SELECTED / Defend the Airfield'));
  setLanguage('hu', { persist: false });
  assert.equal(tr('Attackers neutralized: 2/4'), 'Támadók leküzdve: 2/4');
  assert.equal(tr('STRUCTURE 81%'), 'SZERKEZET 81%');
  assert.equal(tr('FUEL TOT'), 'ÜZEMANYAG');
  assert.equal(tr(value), 'KIJELÖLVE / Védd meg a repteret · Lappföld · Észak-Finnország');
  assert.equal(setLanguage('de', { persist: false }), false);
  assert.equal(i18n.language, 'hu');
});
test('locale resources have matching interpolation variables and complete language pairs', () => {
  for (const [source, entry] of Object.entries(messages)) {
    assert.ok(entry.hu && entry.en, source);
    const vars = (text) => [...text.matchAll(/\{\{(v\d+)\}\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(vars(entry.hu), vars(entry.en), source);
  }
});
test('radio recordings remain English and vendored i18next matches the pinned package', () => {
  assert.equal(
    radioLines.find((l) => l.id === 'clearance-1').text,
    'Falcon One, this is Control. You are cleared for takeoff.',
  );
  assert.ok(radioLines.every((l) => l.url.startsWith('/assets/radio/')));
  const pkg = JSON.parse(
    readFileSync(new URL('../node_modules/i18next/package.json', import.meta.url), 'utf8'),
  );
  const vendor = JSON.parse(
    readFileSync(new URL('../assets/vendor/i18next/version.json', import.meta.url), 'utf8'),
  );
  assert.equal(pkg.version, vendor.version);
});

test('all mission, unit, weapon and handbook prose has English coverage', () => {
  setLanguage('en', { persist: false });
  const untranslated = [];
  function visit(value) {
    if (typeof value === 'string') {
      if (
        /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(value) &&
        !value.includes('http') &&
        /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(tr(value))
      )
        untranslated.push(value);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  }
  visit([
    pilotEntries,
    friendlyEntries,
    weaponEntries,
    countermeasureEntries,
    unitTypes,
    missions,
    missions.map((m) => missionForSide(m, 'east')),
  ]);
  setLanguage('hu', { persist: false });
  assert.deepEqual([...new Set(untranslated)], []);
});
