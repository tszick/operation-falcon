import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from '../src/math.js';
import { configureTerrain, terrainWorld, terrainHeight } from '../src/terrain.js';
import { groundHit, groundCollisionBounds, sweptBoundsOverlap } from '../src/groundModels.js';
import { cachedFeatureVisible, riverSection } from '../src/terrainFeatures.js';
import { featureWindow, buildFeatureBuffers } from '../src/gpuFeatures.js';
test('broad phase never rejects an exact hit on rotated buildings, convoy trucks, airfields or bridges', () => {
  configureTerrain({ id: 'bridge' }, new Vec3(22000, 0, 0), () => 0.3);
  for (const type of ['city-building', 'convoy', 'airbase', 'bridge', 'sam-system'])
    for (const heading of [0, 0.4, Math.PI / 2, 2.3]) {
      const t = {
          id: 'T',
          kind: 'ground',
          type,
          alive: true,
          position: new Vec3(22000, 0, 0),
          velocity: new Vec3(),
          heading,
          buildingHeight: 800,
          buildingWidth: 100,
          buildingDepth: 120,
          routeDistance: 0,
          routeDirection: 1,
        },
        bounds = groundCollisionBounds(t);
      let hits = 0;
      for (let i = 0; i < 80; i++) {
        const y = bounds.y[0] + ((bounds.y[1] - bounds.y[0]) * (i % 10)) / 10,
          from = new Vec3(
            bounds.x[0] - 100,
            y,
            bounds.z[0] + ((bounds.z[1] - bounds.z[0]) * (i % 8)) / 8,
          ),
          to = new Vec3(bounds.x[1] + 100, y, from.z);
        if (groundHit(t, from, to, 12)) {
          assert.equal(sweptBoundsOverlap(bounds, from, to, 12), true);
          hits++;
        }
      }
      assert.ok(hits > 0, type);
      assert.equal(
        sweptBoundsOverlap(bounds, new Vec3(1e6, 1e6, 1e6), new Vec3(1e6 + 50, 1e6, 1e6), 100),
        false,
      );
    }
});
test('visual feature visibility is reused only for bounded camera motion and invalidates with a new world', () => {
  configureTerrain({ id: 'bridge' }, new Vec3(22000, 0, 0), () => 0.3);
  const point = new Vec3(22000, 30, 0);
  let calls = 0;
  const ray = () => {
    calls++;
    return true;
  };
  const camera = new Vec3(0, 1000, 0);
  assert.equal(cachedFeatureVisible(camera, point, ray), true);
  for (let i = 0; i < 20; i++) cachedFeatureVisible(new Vec3(4, 1000.5, 3), point, ray);
  assert.equal(calls, 1);
  cachedFeatureVisible(new Vec3(9, 1000, 0), point, ray);
  assert.equal(calls, 2);
  configureTerrain({ id: 'bridge' }, new Vec3(22000, 0, 0), () => 0.3);
  cachedFeatureVisible(camera, point, ray);
  assert.equal(calls, 3);
});
test('GPU ribbons preserve river levels and bank geometry, with finite patch IDs and bounded cached windows', () => {
  configureTerrain({ id: 'bridge' }, new Vec3(22000, 0, 0), () => 0.3);
  const camera = new Vec3(22000, 1500, 200),
    a = featureWindow(camera),
    b = featureWindow(new Vec3(22000, 1500, 201));
  assert.equal(a.key, b.key);
  const data = buildFeatureBuffers(camera);
  assert.ok(data.vertices.length > 0);
  assert.equal(data.vertices.length % 27, 0);
  assert.ok([...data.vertices].every(Number.isFinite));
  for (let i = 0; i < data.vertices.length; i += 9) {
    const id = data.vertices[i + 8];
    assert.ok(id >= 0 && id < data.patches.length);
    if (data.vertices[i + 6] === 0 && data.vertices[i + 3] === Math.fround(32 / 255))
      assert.equal(data.vertices[i + 1], Math.fround(terrainWorld.river.level));
  }
  const section = riverSection(terrainWorld.river, 0, 100);
  assert.ok(section.every((p) => p.y === terrainWorld.river.level));
  assert.equal(featureWindow(new Vec3(camera.x, 9000, camera.z)).high, true);
});

test('distant chaff keeps a visible pixel while nearby chaff retains its full pattern without changing its physics state', async () => {
  const { renderCountermeasures } = await import('../src/countermeasureVisuals.js');
  const d = {
      id: 1,
      type: 'chaff',
      position: new Vec3(0, 2000, 5000),
      velocity: new Vec3(0, 0, 100),
      age: 1,
      life: 6,
    },
    s = { countermeasures: { decoys: [d] } },
    before = JSON.stringify(s);
  let lines = 0,
    pixels = 0,
    depth = 5000;
  const r = {
    focal: 600,
    projectWorld: () => ({ x: 100, y: 100, depth }),
    line: () => lines++,
    ctx: {
      beginPath() {},
      stroke() {},
      fillRect() {
        pixels++;
      },
    },
  };
  renderCountermeasures(r, s);
  assert.equal(lines, 0);
  assert.equal(pixels, 1);
  depth = 500;
  renderCountermeasures(r, s);
  assert.equal(lines, 9);
  assert.equal(JSON.stringify(s), before);
});

test('batched runway geometry preserves both runway edges, markings and optional three-degree gates', async () => {
  const { homeRunwayMesh } = await import('../src/runwayVisuals.js'),
    { meshBuffers } = await import('../src/gpuModels.js');
  const runway = homeRunwayMesh(false),
    gates = homeRunwayMesh(true);
  assert.equal(homeRunwayMesh(false), runway);
  assert.ok(runway.points.some((p) => p.x === -45 && p.z === -1600));
  assert.ok(runway.points.some((p) => p.x === 45 && p.z === 1600));
  assert.equal(gates.details.length - runway.details.length, 6);
  assert.ok(gates.points.some((p) => p.z === -3600 && p.y > 90));
  assert.equal(meshBuffers(runway).triangles.length, 0);
  assert.equal(meshBuffers(runway).edges.length, runway.details.length * 2);
});

test('allocation-free vector distance exactly matches the previous calculation without mutating either vector', () => {
  for (const a of [new Vec3(), new Vec3(-12345, 8700, 62111), new Vec3(0.000001, 0.003, -0.07)])
    for (const b of [new Vec3(4, 5, 6), new Vec3(-7, 8100, -90000)]) {
      const beforeA = { ...a },
        beforeB = { ...b };
      assert.equal(a.distance(b), a.clone().sub(b).length());
      assert.deepEqual({ ...a }, beforeA);
      assert.deepEqual({ ...b }, beforeB);
    }
});

test('feature LOD hysteresis does not rebuild repeatedly at the altitude boundary', () => {
  configureTerrain({ id: 'bridge' }, new Vec3(22000, 0, 0), () => 0.3);
  const ground = terrainHeight(22000, 200),
    camera = (height) => new Vec3(22000, ground + height, 200);
  let window = featureWindow(camera(3900));
  assert.equal(window.high, false);
  window = featureWindow(camera(4100), window);
  assert.equal(window.high, false);
  window = featureWindow(camera(4300), window);
  assert.equal(window.high, true);
  window = featureWindow(camera(3900), window);
  assert.equal(window.high, true);
  window = featureWindow(camera(3700), window);
  assert.equal(window.high, false);
});

test('deferred environment copies once, flushes on fallback, and does not defer hangar-only terrain', async () => {
  const { GpuModels } = await import('../src/gpuModels.js');
  let copies = 0,
    clearFlag = null;
  const r = {
      w: 1280,
      h: 720,
      ctx: {
        drawImage() {
          copies++;
        },
      },
    },
    g = Object.create(GpuModels.prototype);
  Object.assign(g, {
    gl: { isContextLost: () => false },
    canvas: {},
    terrainPainter: { render() {} },
    featurePainter: { render() {} },
    prepare(_r, clear = true) {
      clearFlag = clear;
    },
    pendingHorizon: r,
    deferEnvironment: true,
  });
  assert.equal(g.renderTerrain(r), true);
  assert.equal(clearFlag, false);
  assert.equal(copies, 0);
  assert.equal(g.finishEnvironment(r), true);
  assert.equal(copies, 1);
  assert.equal(g.deferEnvironment, false);
  g.renderTerrain(r);
  assert.equal(clearFlag, true);
  assert.equal(copies, 2);
  g.environmentReady = r;
  g.featuresUnavailable = true;
  assert.equal(g.finishEnvironment(r), false);
  assert.equal(copies, 3);
  g.terrainUnavailable = true;
  g.pendingHorizon = r;
  assert.equal(g.renderTerrain(r), false);
  assert.equal(copies, 4);
  assert.equal(g.pendingHorizon, null);
});
