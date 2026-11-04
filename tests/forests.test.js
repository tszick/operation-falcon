import test from 'node:test';
import assert from 'node:assert/strict';
import {
  forestPatches,
  forestAt,
  forestCover,
  canopyHeight,
  forestCanopyFaces,
  rasterForests,
} from '../src/forests.js';
import { terrainBuffers } from '../src/rendering/shared/terrainData.js';
import { readTerrainSnapshot } from '../src/terrainSnapshot.js';
const world = { revision: 91, skySeed: 4294967295, noAirfield: false, peaks: [], cityRoads: [] };

test('forests are deterministic connected districts with both species and irregular edges, without ocean trees', () => {
  const a = forestPatches(world);
  assert.deepEqual(a, forestPatches({ ...world }));
  assert.ok(a.some((p) => p.conifer) && a.some((p) => !p.conifer));
  assert.ok(a.every((p) => p.radiusX >= 1300 && p.radiusZ >= 1100));
  assert.notDeepEqual(a, forestPatches({ ...world, skySeed: 123 }));
  assert.deepEqual(forestPatches({ ...world, ocean: true }), []);
  const p = a.at(-1);
  assert.ok(forestAt(p.x, p.z, world).cover > 0.9);
  const radii = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * Math.PI) / 6;
    for (let r = 0.65; r < 1.1; r += 0.01)
      if (
        forestCover(
          p,
          p.x + Math.cos(angle) * r * p.radiusX,
          p.z + Math.sin(angle) * r * p.radiusZ,
          world,
        ) === 0
      )
        return r;
  });
  assert.ok(new Set(radii.map((r) => r.toFixed(2))).size > 3);
});

test('forest coverage leaves runways, cities, roads, water and canyon corridors clear', () => {
  const patch = { x: 0, z: 0, radiusX: 30000, radiusZ: 30000, phase: 0 };
  const w = {
    ...world,
    road: { x: 4000, z: 3000, angle: 0, bend: 0, phase: 0, width: 18 },
    river: { x: -5000, z: 5000, angle: 0, bend: 0, phase: 0, width: 180 },
    cityRoads: [
      { x: 1000, z: 8000, angle: 0, bend: 0, phase: 0, width: 40 },
      { x: 3000, z: 10000, angle: 0, bend: 0, phase: 0, width: 40 },
    ],
    airfields: [{ x: 10000, z: 10000, heading: 0.8 }],
  };
  for (const [x, z] of [
    [0, 0],
    [0, 1400],
    [4000, 3000],
    [-5000, 5000],
    [2000, 9000],
    [10000, 10000],
  ])
    assert.equal(forestCover(patch, x, z, w), 0, `${x},${z}`);
  const canyon = {
    ...world,
    canyon: { x: 5000, z: 5000, angle: 0, bend: 0, phase: 0, width: 700 },
  };
  assert.equal(forestCover(patch, 5000, 5000, canyon), 0);
});

test('near forests form a bounded textured canopy mesh with stable world coordinates and ground-level edges', () => {
  const p = forestPatches(world).at(-1);
  const faces = forestCanopyFaces(p.x, p.z, world, () => 80);
  assert.ok(faces.length > 200 && faces.length <= 14000);
  assert.ok(
    faces.every(
      (f) => f.forest && f.points.every((p) => Number.isFinite(p.y) && p.y >= 80 && p.y < 120),
    ),
  );
  assert.ok(faces.some((f) => f.canopyHeights.some((h) => h === 0)));
  assert.ok(new Set(faces.flatMap((f) => f.canopyHeights.map((h) => h.toFixed(1)))).size > 40);
  const packed = terrainBuffers(faces, { wire: false });
  assert.equal(packed.lines.length, 0);
  faces.forEach((f, i) =>
    f.canopyHeights.forEach((height, j) =>
      assert.ok(Math.abs(packed.fills[i * 18 + j * 6 + 5] * 64 - height) < 0.00001),
    ),
  );
  const moved = forestCanopyFaces(p.x + 450, p.z, world, () => 80);
  const signature = (f) => f.points.map((p) => `${p.x}:${p.y}:${p.z}`).join(';');
  const signatures = new Set(moved.map(signature));
  assert.ok(faces.filter((f) => signatures.has(signature(f))).length > faces.length * 0.8);
  assert.deepEqual(
    forestCanopyFaces(1e7, 1e7, world, () => 0),
    [],
  );
  assert.equal(canopyHeight(p, p.x + p.radiusX * 2, p.z, world), 0);
});

test('far forest texture and worker snapshot preserve coverage, species and full unsigned scenery seeds', () => {
  const size = 512,
    extent = 120000,
    pixels = new Uint8Array(size * size * 4);
  rasterForests(pixels, size, extent, world);
  let broad = 0,
    conifer = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] === 240) broad++;
    if (pixels[i] === 250) conifer++;
  }
  assert.ok(broad > 50 && conifer > 50);
  const snapshot = readTerrainSnapshot(world);
  assert.equal(snapshot.skySeed, 4294967295);
  assert.deepEqual(forestPatches(snapshot), forestPatches(world));
  assert.throws(() => readTerrainSnapshot({ ...world, skySeed: NaN }));
  assert.throws(() => readTerrainSnapshot({ ...world, cityRoads: [null] }));
});
