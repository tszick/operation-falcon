import test from 'node:test';
import assert from 'node:assert/strict';
import { targetTypeLabel } from '../src/targetPresentation.js';
import { equipmentCatalog, equipmentLabel } from '../src/equipmentCatalog.js';
import { tr, setLanguage } from '../src/i18n.js';
import { MarkerLabelLayout } from '../src/rendering/markerLabelLayout.js';
test('instrument target types identify roles across both factions while world labels retain catalogue codes', () => {
  for (const [id, type] of [
    ['f14', 'Elfogó'],
    ['mig31', 'Elfogó'],
    ['f16', 'Vadász'],
    ['j20', 'Vadász'],
    ['b52', 'Bombázó'],
    ['tu95', 'Bombázó'],
    ['c130', 'Szállítógép'],
    ['kc135', 'Tankergép'],
    ['a10', 'Csapásmérő'],
  ]) {
    const target = { type: 'fighter', aircraftId: id };
    assert.equal(targetTypeLabel(target), type);
    assert.match(equipmentLabel(target, { compact: true }), /^[A-Z]+-[A-Z]+-\d+$/);
  }
  for (const e of equipmentCatalog.filter((e) => e.kind === 'aircraft'))
    assert.ok(!targetTypeLabel({ aircraftId: e.id, kind: 'air' }).includes(e.code));
  assert.equal(targetTypeLabel({ type: 'carrier' }), 'Anyahajó');
  assert.equal(targetTypeLabel({ type: 'destroyer' }), 'Romboló');
  assert.equal(targetTypeLabel({ type: 'sam-system' }), 'Légvédelmi rakétarendszer');
  assert.equal(targetTypeLabel({ type: 'tanker' }), 'Tankergép');
  assert.equal(targetTypeLabel({ type: 'fighter', aircraftId: 'airliner' }), 'Civil repülő');
});
test('instrument recognition labels translate in Hungarian and English', () => {
  try {
    setLanguage('en', { persist: false });
    assert.equal(tr(targetTypeLabel({ aircraftId: 'f14' })), 'Interceptor');
    assert.equal(tr(targetTypeLabel({ aircraftId: 'f16' })), 'Fighter');
    assert.equal(tr(targetTypeLabel({ type: 'destroyer' })), 'Destroyer');
    setLanguage('hu', { persist: false });
    assert.equal(tr(targetTypeLabel({ aircraftId: 'f16' })), 'Vadász');
  } finally {
    setLanguage('hu', { persist: false });
  }
});
test('unobstructed labels follow rapid anchor motion without adding tracking lag', () => {
  const layout = new MarkerLabelLayout();
  for (let frame = 0; frame < 100; frame++) {
    const y = 200 + Math.sin(frame * 0.3) * 80,
      used = [];
    const placed = layout.place('far-target', 600, y, 120, 45, 600, used, frame * 16);
    assert.equal(placed, y);
  }
});
test('collision offsets ease instead of jumping 16 pixels and do not toggle at near-overlap thresholds', () => {
  const layout = new MarkerLabelLayout();
  let prior = layout.place('target', 600, 200, 120, 45, 600, [], 0);
  for (let frame = 1; frame < 40; frame++) {
    const used = frame % 2 ? [{ left: 550, right: 650, top: 188, bottom: 204 }] : [];
    const y = layout.place('target', 600, 200, 120, 45, 600, used, frame * 16);
    assert.ok(Math.abs(y - prior) < 3, `${y} vs ${prior}`);
    prior = y;
  }
  assert.equal(layout.states.get('target').slot, 2);
  for (let frame = 40; frame < 100; frame++)
    layout.place('target', 600, 200, 120, 45, 600, [], frame * 16);
  assert.equal(layout.states.get('target').slot, 0);
  layout.beginFrame(4000);
  assert.equal(layout.states.size, 0);
});
