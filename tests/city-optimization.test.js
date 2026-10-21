import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../src/renderer.js';
import { Quat } from '../src/math.js';
import { terrainFeatureVisible } from '../src/terrainFeatures.js';
import { groundInstances, groundMesh, groundHit, buildingDetail } from '../src/groundModels.js';
import { Vec3 } from '../src/math.js';
import { configureTerrain } from '../src/terrain.js';
import { visibleMeshEdges } from '../src/hiddenLines.js';
const building = () => ({
  type: 'city-building',
  city: true,
  alive: true,
  position: new Vec3(0, 3, 16000),
  heading: 0.3,
  buildingHeight: 100,
  buildingWidth: 24,
  buildingDepth: 28,
});
test('city detail decreases with distance, retaining an opaque volume and the full collision bounds', () => {
  const t = building();
  assert.equal(buildingDetail(t, new Vec3(0, 50, 15500)), 'near');
  assert.equal(buildingDetail(t, new Vec3(0, 500, 13000)), 'medium');
  assert.equal(buildingDetail(t, new Vec3(0, 500, 0)), 'far');
  const near = groundInstances(t)[0],
    medium = groundInstances(t, { detail: 'medium' })[0],
    far = groundInstances(t, { detail: 'far' })[0];
  assert.ok(near.mesh.details.length > 0);
  assert.equal(medium.mesh.details.length, 0);
  assert.equal(far.mesh.details.length, 0);
  assert.equal(far.mesh.faces.length, 6);
  assert.equal(far.mesh.points.length, 8);
  for (const axis of ['x', 'y', 'z'])
    for (let i = 0; i < 2; i++)
      assert.ok(Math.abs(near.mesh.bounds[axis][i] - far.mesh.bounds[axis][i]) < 0.051);
  assert.ok(near.mesh.points.length > far.mesh.points.length);
  const p = near.position.clone();
  assert.ok(groundHit(t, p.clone().add(new Vec3(0, 200, 0)), p.clone().add(new Vec3(0, -1, 0))));
  assert.equal(groundInstances(t)[0], near);
});
test('cached static instances rebuild after movement, destruction and terrain revision changes', () => {
  const t = building(),
    first = groundInstances(t);
  assert.equal(groundInstances(t), first);
  t.position.x += 100;
  const moved = groundInstances(t);
  assert.notEqual(moved, first);
  t.alive = false;
  const rubble = groundInstances(t);
  assert.ok(rubble[0].mesh.bounds.y[1] < 10);
  configureTerrain({ id: 'landing' });
  assert.notEqual(groundInstances(t), rubble);
});
test('spatial hidden-line broad phase gives the same segments as exhaustive testing, including tile edges and huge faces', () => {
  for (const perspective of [true, false]) {
    const points = [],
      faces = [],
      details = [];
    let seed = 437;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(random() * 800) - 400,
        y = Math.floor(random() * 600) - 300,
        w = 10 + random() * 70,
        h = 10 + random() * 70,
        depth = 5 + random() * 100,
        base = points.length;
      points.push(
        { x, y, depth },
        { x: x + w, y, depth },
        { x: x + w, y: y + h, depth },
        { x, y: y + h, depth },
      );
      faces.push([base, base + 1, base + 2, base + 3]);
    }
    const base = points.length;
    points.push(
      { x: -10000, y: -10000, depth: 1000 },
      { x: 10000, y: -10000, depth: 1000 },
      { x: 10000, y: 10000, depth: 1000 },
      { x: -10000, y: 10000, depth: 1000 },
    );
    faces.push([base, base + 1, base + 2, base + 3]);
    const canonical = (segments) =>
      segments.map((pair) => pair.map((p) => [+p.x.toFixed(6), +p.y.toFixed(6)]).join('|')).sort();
    assert.deepEqual(
      canonical(visibleMeshEdges(points, faces, details, { perspective, spatial: true })),
      canonical(visibleMeshEdges(points, faces, details, { perspective, spatial: false })),
    );
  }
});
test('ground bounding rejection keeps rotated truck and building collision accurate', () => {
  const t = building(),
    instance = groundInstances(t)[0],
    p = instance.position;
  assert.equal(
    groundHit(
      t,
      new Vec3(p.x + 1000, p.y + 30, p.z - 500),
      new Vec3(p.x + 1000, p.y + 30, p.z + 500),
    ),
    false,
  );
  assert.ok(groundHit(t, new Vec3(p.x, p.y + 30, p.z - 500), new Vec3(p.x, p.y + 30, p.z + 500)));
  assert.equal(groundMesh('city-building', 100, { detail: 'far' }).points.length, 8);
});

test('column visibility reuse is exact at multiple heights, resets with the camera and preserves ridge occlusion', () => {
  configureTerrain({ id: 'bunker' }, new Vec3(22000, 0, 0), () => 0.23);
  const r = Object.create(Renderer.prototype);
  r.setup(new Vec3(0, 600, -1000), new Quat());
  for (const x of [0, 500, 3000, 18000])
    for (const z of [1000, 8000, 22000])
      for (const height of [500, 0, 1000, 20, 100, 800]) {
        const p = new Vec3(x, height, z);
        assert.equal(r.worldVisible(p), terrainFeatureVisible(r.camera, p));
      }
  const previous = r.visibilityColumns;
  r.setup(new Vec3(1000, 800, -1000), new Quat());
  assert.notEqual(r.visibilityColumns, previous);
  assert.equal(r.visibilityColumns.size, 0);
});

test('metropolis has a flyable street grid, varied skyscraper skyline and the same 25 defense objectives', async () => {
  const { createTargets } = await import('../src/targeting.js'),
    { aircraft, missions } = await import('../src/aircraftSpec.js');
  for (const value of [0, 0.5, 0.999]) {
    const city = createTargets(
      missions.find((m) => m.id === 'defend-city'),
      aircraft[0],
      { rng: () => value },
    ).filter((t) => t.city);
    assert.equal(city.length, 25);
    const center = city.find((t) => t.id === 'CITY-2-2');
    assert.ok(center.buildingHeight >= 820 && center.buildingHeight <= 900);
    assert.ok(
      Math.max(...city.map((t) => t.position.x)) - Math.min(...city.map((t) => t.position.x)) >=
        3600,
    );
    for (const a of city) {
      assert.ok(a.buildingHeight >= 180);
      for (const b of city) {
        if (a === b) continue;
        if (a.position.z === b.position.z)
          assert.ok(
            Math.abs(a.position.x - b.position.x) - a.buildingWidth - b.buildingWidth >= 620,
          );
        if (a.position.x === b.position.x)
          assert.ok(
            Math.abs(a.position.z - b.position.z) - a.buildingDepth - b.buildingDepth >= 620,
          );
      }
    }
    // A straight street between two rows remains outside all building collision volumes.
    const start = new Vec3(450, 500, 13500),
      end = new Vec3(450, 500, 18500);
    assert.equal(
      city.some((t) => groundHit(t, start, end, 8)),
      false,
    );
  }
});
test('a 900-metre skyscraper keeps a bounded detail budget and a simple opaque distant silhouette', () => {
  const mesh = groundMesh('city-building', 900, { width: 140, depth: 140, detail: 'near' }),
    far = groundMesh('city-building', 900, { width: 140, depth: 140, detail: 'far' });
  assert.ok(mesh.details.length <= 24);
  assert.equal(far.faces.length, 6);
  assert.equal(far.points.length, 8);
  assert.equal(far.details.length, 0);
  assert.ok(mesh.bounds.y[1] >= 900);
});
