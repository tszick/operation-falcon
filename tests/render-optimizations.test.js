import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from '../src/math.js';
import { terrainHeight, configureTerrain } from '../src/terrain.js';
import { terrainFeatureVisible, projectFeaturePolygon } from '../src/terrainFeatures.js';
import { silhouetteIndices } from '../src/modelDetail.js';
function reference(a, b) {
  const d = b.clone().sub(a),
    steps = Math.min(80, Math.ceil(Math.hypot(d.x, d.z) / 100));
  for (let i = 1; i < steps; i++) {
    const p = a.clone().add(d.clone().scale(i / steps));
    if (terrainHeight(p.x, p.z) > p.y + 1.5) return false;
  }
  return true;
}
test('high-altitude visibility shortcut agrees with the full terrain-ray calculation across generated worlds', () => {
  let seed = 731;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const id of ['airbase', 'bunker', 'bridge', 'convoy']) {
    configureTerrain({ id }, new Vec3(22000, 0, 0), random);
    for (let i = 0; i < 80; i++) {
      const a = new Vec3(random() * 40000 - 10000, random() * 12000, random() * 40000 - 20000),
        b = new Vec3(random() * 40000 - 10000, random() * 3000, random() * 40000 - 20000);
      assert.equal(terrainFeatureVisible(a, b), reference(a, b));
    }
  }
});
test('shared vertex projection reuses camera transforms without changing polygon clipping', () => {
  let calls = 0;
  const r = {
      w: 1000,
      h: 800,
      focal: 400,
      local: (p) => {
        calls++;
        return p.clone();
      },
    },
    p = [new Vec3(-1, 0, 0.5), new Vec3(1, 0, 10), new Vec3(1, 1, 10), new Vec3(-1, 1, 0.5)],
    cache = new Map();
  const a = projectFeaturePolygon(r, [p[0], p[1], p[2]], cache),
    b = projectFeaturePolygon(r, [p[0], p[2], p[3]], cache);
  assert.equal(calls, 4);
  assert.deepEqual(a, projectFeaturePolygon(r, [p[0], p[1], p[2]]));
  assert.deepEqual(b, projectFeaturePolygon(r, [p[0], p[2], p[3]]));
});
test('distant model silhouettes retain exterior vertices and omit internal detail points', () => {
  const points = [
    { x: -3, y: 0 },
    { x: 0, y: -2 },
    { x: 3, y: 0 },
    { x: 0, y: 2 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ];
  assert.deepEqual(new Set(silhouetteIndices(points)), new Set([0, 1, 2, 3]));
});
