import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cockpitHeight,
  wellQuad,
  homography,
  matrix3d,
  screenWells,
  compactObjective,
  cockpitHudFooterY,
} from '../src/cockpitGeometry.js';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
test('perspective screen mapping preserves all four physical screen corners and the CSS transform convention', () => {
  for (const [w, h] of [
    [1024, 768],
    [1280, 720],
    [1896, 914],
    [1920, 1080],
  ])
    for (const name of Object.keys(screenWells)) {
      const q = wellQuad(name, w, cockpitHeight(w, h)),
        H = homography(280, 120, q),
        M = matrix3d(H);
      for (const [i, [x, y]] of [
        [0, [0, 0]],
        [1, [280, 0]],
        [2, [280, 120]],
        [3, [0, 120]],
      ]) {
        const denominator = M[3] * x + M[7] * y + M[15];
        close((M[0] * x + M[4] * y + M[12]) / denominator, q[i][0]);
        close((M[1] * x + M[5] * y + M[13]) / denominator, q[i][1]);
      }
    }
});
test('the cockpit stays below a third, preserves the lower HUD readings, and all screen wells stay in the cockpit', () => {
  for (const [w, h] of [
    [1024, 768],
    [1280, 720],
    [1366, 768],
    [1896, 914],
    [1920, 1080],
  ]) {
    const height = cockpitHeight(w, h);
    assert.ok(height <= h / 3);
    assert.ok(cockpitHudFooterY(w, h) + 23 <= h - height);
    for (const name of Object.keys(screenWells))
      for (const [x, y] of wellQuad(name, w, height)) {
        assert.ok(x >= 0 && x <= w);
        assert.ok(y >= 0 && y <= height);
      }
  }
});
test('compact objective labels keep dynamic base health and leave the full mission row unchanged', () => {
  const row = { id: 'base', text: 'Saját reptér: 81%' };
  assert.equal(compactObjective(row), 'Bázis: 81%');
  assert.equal(row.text, 'Saját reptér: 81%');
  assert.equal(
    compactObjective({ id: 'enemyBase', text: 'Ellenséges reptér megsemmisítve' }),
    'Reptér',
  );
});
