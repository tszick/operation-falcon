import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFarmland, farmlandSize, farmlandPalette } from '../src/farmland.js';
import { pathCoordinates } from '../src/terrain.js';
const world = {
  skySeed: 417,
  peaks: [],
  road: { x: 12000, z: 0, angle: 0, bend: 0, phase: 0, width: 18 },
  river: { x: 0, z: 12000, angle: 0, bend: 0, phase: 0, width: 250 },
  airfields: [{ x: 16000, z: 16000, heading: 0.8 }],
};

test('land-use atlas is deterministic, world-fixed, varied and denser around infrastructure', () => {
  const a = buildFarmland(world, () => 0),
    b = buildFarmland(world, () => 0);
  assert.deepEqual(a, b);
  assert.equal(a.pixels.length, farmlandSize * farmlandSize * 4);
  assert.ok(a.parcels.length > 150);
  assert.ok(new Set(a.parcels.map((p) => p.direction)).size >= 8);
  assert.ok(a.parcels.some((p) => p.crop > 0.96));
  assert.ok(
    a.parcels.every(
      (p) => p.width >= 280 && p.width <= 1800 && p.length >= 350 && p.length <= 2400,
    ),
  );
  const near = a.parcels.filter((p) => Math.hypot(p.x, p.z) < 10000).length;
  const far = a.parcels.filter((p) => Math.hypot(p.x - 40000, p.z - 40000) < 10000).length;
  assert.ok(near > far * 2, `${near} settlement parcels versus ${far} remote parcels`);
  assert.notDeepEqual(a.parcels, buildFarmland({ ...world, skySeed: 418 }, () => 0).parcels);
});

test('farmland avoids water, roads, runway infrastructure, city blocks and steep ground', () => {
  const cityRoads = [
    { x: 0, z: 24000, angle: 0, bend: 0, phase: 0, width: 42, min: -2400, max: 2400 },
    { x: 1800, z: 26000, angle: Math.PI / 2, bend: 0, phase: 0, width: 42, min: -2400, max: 2400 },
  ];
  for (const p of buildFarmland({ ...world, cityRoads }, () => 0).parcels) {
    const radius = Math.hypot(p.width, p.length) * 0.5;
    assert.ok(Math.abs(pathCoordinates(world.river, p.x, p.z).across) > 125 + radius);
    assert.ok(Math.abs(pathCoordinates(world.road, p.x, p.z).across) > 9 + radius);
    assert.ok(
      !(p.x > -700 - radius && p.x < 2500 + radius && p.z > 23300 - radius && p.z < 26700 + radius),
    );
    assert.ok(!(Math.abs(p.x) < 650 + radius && Math.abs(p.z) < 2100 + radius));
  }
  assert.equal(buildFarmland(world, (x, z) => x + z).parcels.length, 0);
  assert.equal(buildFarmland({ ...world, ocean: true }, () => 0).parcels.length, 0);
});

test('seasonal crops use subdued snow and desert colours with rare flowering fields', () => {
  for (const mode of ['grass', 'desert', 'winter', 'night', 'rocky', 'sunset']) {
    const palette = farmlandPalette(mode);
    assert.equal(palette.length, 5);
    assert.ok(palette.flat().every((v) => v >= 0 && v <= 1));
  }
  assert.notDeepEqual(farmlandPalette('grass'), farmlandPalette('desert'));
  assert.ok(farmlandPalette('winter').every((c) => Math.max(...c) - Math.min(...c) < 0.08));
});

test('fields share narrow boundaries and form large continuous agricultural districts', () => {
  const { parcels } = buildFarmland(world, () => 0);
  const adjoining = parcels.filter((p) =>
    parcels.some((q) => {
      if (p === q || p.district !== q.district) return false;
      const dx = q.x - p.x,
        dz = q.z - p.z,
        c = Math.cos(p.angle),
        s = Math.sin(p.angle);
      const x = Math.abs(dx * c + dz * s),
        z = Math.abs(-dx * s + dz * c);
      return (
        (z < 1 && Math.abs(x - (p.width + q.width) / 2 - 26) < 1) ||
        (x < 1 && Math.abs(z - (p.length + q.length) / 2 - 26) < 1)
      );
    }),
  );
  assert.ok(adjoining.length > parcels.length * 0.7);
  const districts = Map.groupBy(parcels, (p) => p.district);
  assert.ok(
    [...districts.values()].some(
      (ps) => ps.length > 25 && ps.reduce((a, p) => a + p.width * p.length, 0) > 15000000,
    ),
  );
});
