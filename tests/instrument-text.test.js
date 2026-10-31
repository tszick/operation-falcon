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
