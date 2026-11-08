import test from 'node:test';
import assert from 'node:assert/strict';
import { createAircraft } from '../src/physics.js';
import { aircraftFlightSpec } from '../src/aiAircraftSpec.js';
import { updateStores } from '../src/storesDisplay.js';
function display() {
  let html = '',
    writes = 0;
  const count = { textContent: '' };
  return {
    count,
    get writes() {
      return writes;
    },
    get innerHTML() {
      return html;
    },
    set innerHTML(v) {
      writes++;
      html = v;
    },
    querySelector(selector) {
      // DOM-less translation keeps inert, escaped markup; model the same ammo slot.
      return selector === '[data-weapon="gun"] b' &&
        (html.includes('data-weapon="gun"') || html.includes('data-weapon=&quot;gun&quot;'))
        ? count
        : null;
    },
  };
}
function setup(t) {
  const prior = globalThis.document,
    root = display();
  let current = root;
  globalThis.document = { getElementById: () => current };
  t.after(() => {
    if (prior === undefined) delete globalThis.document;
    else globalThis.document = prior;
  });
  return {
    root,
    setRoot: (r) => (current = r),
    s: createAircraft(aircraftFlightSpec('f16')),
    weapons: { selected: 'gun' },
  };
}
test('cannon bursts update only the ammo number and retain the existing airframe SVG', (t) => {
  const { s, weapons, root } = setup(t);
  updateStores(s, weapons, { compact: true });
  const html = root.innerHTML,
    ammo = s.ammo.gun;
  for (let i = 1; i <= 30; i++) {
    s.ammo.gun = ammo - i;
    updateStores(s, weapons, { compact: true });
  }
  assert.equal(root.writes, 1);
  assert.equal(root.innerHTML, html);
  assert.equal(root.count.textContent, String(ammo - 30));
  s.ammo.gun = 0;
  updateStores(s, weapons, { compact: true });
  assert.equal(root.writes, 2);
  assert.match(root.innerHTML, /store gun empty/);
});
test('damage and weapon changes redraw independently while a replacement HUD root gets its own initial render', (t) => {
  const { s, weapons, root, setRoot } = setup(t);
  updateStores(s, weapons);
  s.condition.parts.leftWing = 0.6;
  s.damage = 15;
  updateStores(s, weapons);
  assert.equal(root.writes, 2);
  assert.match(root.innerHTML, /part-damage/);
  weapons.selected = 'aam';
  updateStores(s, weapons);
  assert.equal(root.writes, 3);
  const next = display();
  setRoot(next);
  updateStores(s, weapons);
  assert.equal(next.writes, 1);
  assert.equal(next.innerHTML, root.innerHTML);
});
