import { controlTextWidth } from '../src/rendering/instrumentText.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ellipsizeText } from '../src/rendering/instrumentText.js';
import { compactObjective } from '../src/cockpitGeometry.js';

test('cockpit overflow preserves readable glyph widths and uses a real ellipsis', () => {
  const measure = (text) => [...text].length * 5.5;
  for (const width of [0, 4, 6, 35, 63, 100, 300]) {
    for (const text of [
      'Stabil repülés: 4000 m · IAS 600 km/h · 12 s',
      'Szuhoj Szu-47 Berkut',
      'OK',
      '',
    ]) {
      const fitted = ellipsizeText(text, width, measure);
      assert.ok(measure(fitted) <= width);
      if (measure(text) <= width) assert.equal(fitted, text);
      else if (width >= measure('…')) assert.ok(fitted.endsWith('…'));
    }
  }
});

test('test-flight cockpit objectives use short labels while retaining full source text', () => {
  for (const [id, expected] of Object.entries({
    'test-takeoff': 'Felszállás',
    'test-level': 'Szinttartás',
    'test-left': 'Bal forduló',
    'test-right': 'Jobb forduló',
  })) {
    const row = { id, text: 'A detailed test target with altitude, speed and duration' };
    assert.equal(compactObjective(row), expected);
    assert.ok(row.text.includes('altitude'));
  }
});

test('explicit borderless cockpit widths fit labels without synchronous geometry reads and follow resizing', () => {
  const element = {
    style: { width: '103.7px' },
    get clientWidth() {
      throw new Error('layout forced');
    },
  };
  assert.equal(controlTextWidth(element), 104);
  element.style.width = '127.2px';
  assert.equal(controlTextWidth(element), 127);
});
test('controls without a valid explicit pixel width keep measured-width fallback', () => {
  for (const width of ['', 'auto', '50%', '0px', '-10px', 'Infinitypx'])
    assert.equal(controlTextWidth({ style: { width }, clientWidth: 87 }), 87);
});
