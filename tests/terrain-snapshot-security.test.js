import test from 'node:test';
import assert from 'node:assert/strict';
import { readTerrainSnapshot, readTerrainJob, readVisibilityJob } from '../src/terrainSnapshot.js';
import {
  configureTerrain,
  terrainWorld,
  terrainHeight,
  withTerrainSnapshot,
} from '../src/terrain.js';
import { missions, aircraft } from '../src/aircraftSpec.js';
import { createTargets } from '../src/targeting.js';

test('worker terrain snapshots discard unknown fields, markup and prototype data at every level', () => {
  const value = JSON.parse(
    '{"revision":1,"airfield":{"name":"<img src=x onerror=alert(1)>"},"airfields":[{"x":0,"z":0,"elevation":0,"heading":0,"name":"<script>"}],"road":{"x":0,"z":0,"angle":0,"bend":0,"phase":0,"width":14,"name":"<svg>","__proto__":{"polluted":true}},"peaks":[],"__proto__":{"polluted":true}}',
  );
  const clean = readTerrainSnapshot(value);
  assert.equal(clean.airfield, undefined);
  assert.equal(clean.airfields[0].name, undefined);
  assert.equal(clean.road.name, undefined);
  assert.equal(Object.hasOwn(clean, '__proto__'), false);
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') Object.values(node).forEach(walk);
    else assert.ok(node === null || ['number', 'boolean'].includes(typeof node));
  };
  walk(clean);
  assert.equal(clean.polluted, undefined);
});
test('worker geometry rejects strings, non-finite coordinates, malformed lists and oversized jobs', () => {
  for (const revision of ['<img>', NaN, Infinity, -Infinity])
    assert.throws(() => readTerrainSnapshot({ revision }));
  assert.throws(() => readTerrainSnapshot({ revision: 1, peaks: new Array(1025).fill({}) }));
  assert.throws(() => readTerrainSnapshot({ revision: 1, road: { x: '<svg>' } }));
  assert.throws(() => readTerrainSnapshot({ revision: 1, islands: {} }));
  const job = { key: 'safe:1', revision: 1, world: { revision: 1 }, cx: 0, cz: 0 };
  assert.throws(() => readTerrainJob({ ...job, key: '<script>' }));
  assert.throws(() => readTerrainJob({ ...job, patches: new Array(4097).fill({}) }));
  assert.throws(() =>
    readVisibilityJob({ ...job, windowKey: 'safe', camera: { x: Infinity }, points: [] }),
  );
});
test('numeric worker snapshots preserve all campaign terrain heights, including islands and runway corridors', () => {
  for (const mission of missions) {
    createTargets(
      mission,
      aircraft.find((a) => a.id === 'f16'),
      { rng: () => 0.3 },
    );
    const original = terrainWorld,
      clean = readTerrainSnapshot(structuredClone(original));
    const points = [
      [0, 0],
      [100, 8000],
      [4500, 8500],
      [22000, 0],
      [-25000, 6000],
      ...(original.islands || []).slice(0, 3).map((i) => [i.x, i.z]),
    ];
    const expected = points.map(([x, z]) => terrainHeight(x, z));
    const actual = withTerrainSnapshot(clean, () => points.map(([x, z]) => terrainHeight(x, z)));
    assert.deepEqual(actual, expected, mission.id);
    assert.equal(terrainWorld, original);
  }
});
test('visibility jobs retain finite geometry only and terrain jobs retain transferable build settings', () => {
  configureTerrain({ id: 'bridge' });
  const job = {
    key: 'safe:1',
    revision: terrainWorld.revision,
    world: terrainWorld,
    cx: 0,
    cz: 0,
    patches: [{ x: 1, z: 2, radius: 100, html: '<img>' }],
    wire: false,
  };
  const terrain = readTerrainJob(job);
  assert.equal(terrain.wire, false);
  assert.deepEqual(terrain.patches, [{ x: 1, z: 2, radius: 100 }]);
  const visibility = readVisibilityJob({
    ...job,
    windowKey: 'window:1',
    camera: { x: 0, y: 1000, z: 0 },
    points: [{ x: 100, y: 30, z: 200 }, null],
  });
  assert.deepEqual(visibility.points, [{ x: 100, y: 30, z: 200 }, null]);
});
