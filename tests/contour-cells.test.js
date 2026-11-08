import test from 'node:test';
import assert from 'node:assert/strict';
import { contourCellCrossesLevel } from '../src/tacticalMap.js';

test('contour rejection preserves every perimeter crossing including exact levels and saddle cells', () => {
  let seed = 123456;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let i = 0; i < 20000; i++) {
    const level = Math.floor(random() * 30) * 100;
    const corners = Array.from({ length: 4 }, () => Math.floor(random() * 30) * 100);
    const original = corners.some((h, j) => h < level !== corners[(j + 1) % 4] < level);
    assert.equal(contourCellCrossesLevel(...corners, level), original);
  }
  assert.equal(contourCellCrossesLevel(0, 0, 0, 0, 100), false);
  assert.equal(contourCellCrossesLevel(650, 650, 650, 650, 100), false);
  assert.equal(contourCellCrossesLevel(100, 100, 100, 100, 100), false);
  assert.equal(contourCellCrossesLevel(0, 100, 0, 100, 100), true);
  assert.equal(contourCellCrossesLevel(0, 200, 0, 200, 100), true);
});
