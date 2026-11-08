import { Renderer } from '../src/renderer.js';
import { aircraft } from '../src/aircraftSpec.js';
import { createAircraft } from '../src/physics.js';
import { buildFarmland } from '../src/farmland.js';
import { prepareInitialTerrain, terrainSnapshot } from '../src/terrainSurface.js';
import { Vec3, clamp } from '../src/math.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainBuildQueue } from '../src/terrainBuildQueue.js';
import { prepareTerrain } from '../src/terrainPreparation.js';
import { configureTerrain, terrainWorld, withTerrainSnapshot } from '../src/terrain.js';
import { buildTerrainSurface } from '../src/terrainSurface.js';
import { packedTerrainBuffers } from '../src/rendering/shared/terrainData.js';
import { updateBuffer } from '../src/rendering/webgpu/device.js';
import { FrameTelemetry } from '../src/frameTelemetry.js';
function fakeWorker() {
  return {
    sent: [],
    postMessage(job) {
      this.sent.push(job);
    },
    terminate() {
      this.stopped = true;
    },
  };
}
test('terrain worker coalesces rapid movement into one latest pending build', () => {
  const w = fakeWorker(),
    q = new TerrainBuildQueue(w);
  for (const key of ['a', 'b', 'c']) q.request({ key, revision: 1 });
  assert.deepEqual(
    w.sent.map((j) => j.key),
    ['a'],
  );
  w.onmessage({ data: { key: 'a', revision: 1 } });
  assert.deepEqual(
    w.sent.map((j) => j.key),
    ['a', 'c'],
  );
  w.onmessage({ data: { key: 'c', revision: 1 } });
  assert.equal(q.take(1).key, 'c');
  assert.equal(q.take(1), null);
});
test('terrain worker rejects another mission and retains a synchronous fallback after errors', () => {
  const w = fakeWorker(),
    q = new TerrainBuildQueue(w);
  q.request({ key: 'old', revision: 1 });
  q.request({ key: 'new', revision: 2 });
  w.onmessage({ data: { key: 'old', revision: 1 } });
  assert.equal(q.take(2), null);
  assert.equal(w.sent.at(-1).key, 'new');
  w.onerror();
  assert.ok(q.failed && w.stopped);
  q.request({ key: 'ignored', revision: 3 });
  assert.equal(w.sent.length, 2);
});
test('background terrain matches exact live geometry, including local vehicle detail', () => {
  configureTerrain({ id: 'convoy', target: 'convoy' });
  const live = terrainWorld,
    world = structuredClone(live),
    patches = [{ x: 1200, z: 600, radius: 100 }];
  const expected = packedTerrainBuffers(
    buildTerrainSurface(0, 0, undefined, { vehiclePatches: patches }),
    { wire: false },
  );
  const actual = prepareTerrain({
    key: 'test',
    revision: live.revision,
    world,
    cx: 0,
    cz: 0,
    patches,
    wire: false,
  });
  assert.deepEqual(actual.fills, expected.fills);
  assert.equal(
    'mask' in actual,
    false,
    'The depth pass reuses fill vertices instead of transferring another mesh',
  );
  assert.equal(actual.lines.length, 0);
  assert.equal(actual.gpuLines.length, 0);
  assert.equal(actual.faceCount, expected.faceCount);
  assert.equal(terrainWorld, live);
  assert.throws(() =>
    withTerrainSnapshot(world, () => {
      throw new Error('test');
    }),
  );
  assert.equal(terrainWorld, live);
});
test('disabling terrain wires preserves surface fills without allocating edge data', () => {
  const faces = buildTerrainSurface(0, 0),
    a = packedTerrainBuffers(faces),
    b = packedTerrainBuffers(faces, { wire: false });
  assert.deepEqual(a.fills, b.fills);
  assert.ok(a.lines.length > 0);
  assert.equal(b.lines.length + b.gpuLines.length, 0);
});
test('GPU terrain buffers retain capacity and only reallocate when growing', () => {
  const allocations = [],
    writes = [],
    device = {
      createBuffer(options) {
        const b = {
          ...options,
          destroy() {
            this.destroyed = true;
          },
        };
        allocations.push(b);
        return b;
      },
      queue: {
        writeBuffer(...args) {
          writes.push(args);
        },
      },
    };
  const first = updateBuffer(device, null, new Float32Array(7), 40);
  assert.equal(first.size, 32);
  assert.equal(updateBuffer(device, first, new Float32Array(6), 40), first);
  assert.equal(allocations.length, 1);
  const second = updateBuffer(device, first, new Float32Array(9), 40);
  assert.ok(first.destroyed);
  assert.equal(second.size, 64);
  assert.equal(writes.length, 3);
});
test('flight log retains isolated CPU stage spikes rather than only averages', () => {
  const t = new FrameTelemetry();
  t.add({ frameMs: 16, renderMs: 2, terrainMs: 0.1 });
  t.add({ frameMs: 90, renderMs: 70, terrainMs: 65, terrainRebuilt: true });
  const report = t.flush();
  assert.equal(report.maxTerrainMs, 65);
  assert.equal(report.maxRenderMs, 70);
  assert.equal(report.terrainRebuilds, 1);
});

test('terrain scalar edge calculations preserve original normals, lighting and centers exactly', () => {
  const faces = buildTerrainSurface(
    0,
    0,
    (x, z) => 70 * Math.sin(x / 3700) + 40 * Math.cos(z / 2300),
  );
  assert.ok(faces.length > 1000);
  for (const face of faces) {
    const pts = face.points;
    const normal = pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0])).normalize();
    if (normal.y < 0) normal.scale(-1);
    const light = clamp(normal.dot(new Vec3(-0.36, 0.86, -0.36)), 0, 1);
    assert.deepEqual(face.normal, normal);
    assert.deepEqual(face.center, pts.reduce((p, v) => p.add(v), new Vec3()).scale(1 / 3));
    assert.equal(
      face.color,
      `rgb(${Math.round(12 + light * 8)},${Math.round(27 + light * 18)},${Math.round(20 + light * 10)})`,
    );
  }
});

test('initial background terrain includes the byte-identical land-use atlas without changing the live mission', () => {
  configureTerrain({ id: 'convoy', target: 'convoy' }, new Vec3(22000, 0, 0), () => 0.5);
  const live = terrainWorld,
    expected = buildFarmland().pixels;
  const actual = prepareTerrain({
    key: 'startup',
    revision: live.revision,
    world: terrainSnapshot(),
    cx: 0,
    cz: 0,
    wire: false,
    patches: [],
    atlas: true,
  });
  assert.deepEqual(actual.farmlandPixels, expected);
  assert.ok(actual.fills.length > 0);
  assert.equal(terrainWorld, live);
  const later = prepareTerrain({
    key: 'later',
    revision: live.revision,
    world: terrainSnapshot(),
    cx: 450,
    cz: 0,
    wire: false,
    patches: [],
  });
  assert.equal(later.farmlandPixels, undefined);
});

test('first GPU terrain stays pending until the worker completes and refuses an old mission result', (t) => {
  const workers = [];
  const oldWorker = globalThis.Worker;
  globalThis.Worker = class {
    constructor() {
      const w = fakeWorker();
      workers.push(w);
      return w;
    }
  };
  t.after(() => {
    if (oldWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = oldWorker;
  });
  configureTerrain({ id: 'none' }, new Vec3(22000, 0, 0), () => 0.99);
  const r = { gpuModels: {}, surfaceLines: false },
    position = new Vec3();
  assert.equal(prepareInitialTerrain(r, position), false);
  assert.equal(r.terrainSurface, undefined);
  const worker = workers[0],
    first = worker.sent[0];
  assert.equal(first.atlas, true);
  configureTerrain({ id: 'none' }, new Vec3(25000, 0, 0), () => 0.5);
  assert.equal(prepareInitialTerrain(r, position), false);
  worker.onmessage({
    data: { key: first.key, revision: first.revision, farmlandPixels: new Uint8Array([1]) },
  });
  assert.equal(prepareInitialTerrain(r, position), false);
  assert.equal(r.terrainFarmland, undefined);
  const fresh = worker.sent.at(-1),
    pixels = new Uint8Array([2, 3, 4, 5]);
  worker.onmessage({
    data: {
      key: fresh.key,
      revision: fresh.revision,
      farmlandPixels: pixels,
      fills: new Float32Array(18),
      lines: new Float32Array(),
      gpuLines: new Float32Array(),
      buildMs: 70,
    },
  });
  assert.equal(prepareInitialTerrain(r, position), true);
  assert.equal(r.terrainRevision, terrainWorld.revision);
  assert.equal(r.terrainFarmland, pixels);
  assert.equal(r.terrainBuffers.farmlandPixels, undefined);
  assert.equal(r.terrainWorkerMs, 70);
  assert.equal(workers.length, 1);
  assert.equal(prepareInitialTerrain(r, position), true);
});

test('a stalled terrain worker times out instead of holding the initial loading view forever', () => {
  let now = 0;
  const worker = fakeWorker(),
    q = new TerrainBuildQueue(worker, { now: () => now, timeoutMs: 50 });
  q.request({ key: 'initial', revision: 1 });
  now = 49;
  q.request({ key: 'initial', revision: 1 });
  assert.equal(q.failed, false);
  now = 50;
  q.request({ key: 'new', revision: 2 });
  assert.equal(q.failed, true);
  assert.equal(worker.stopped, true);
  assert.equal(q.busy, null);
  worker.onmessage({ data: { key: 'initial', revision: 1 } });
  assert.equal(q.take(1), null);
});

test('a failed initial worker permits the synchronous fallback on the next render', (t) => {
  const worker = fakeWorker(),
    oldWorker = globalThis.Worker;
  globalThis.Worker = class {
    constructor() {
      return worker;
    }
  };
  t.after(() => {
    if (oldWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = oldWorker;
  });
  configureTerrain({ id: 'none' }, new Vec3(22000, 0, 0), () => 0.99);
  const r = { gpuModels: {}, surfaceLines: false };
  assert.equal(prepareInitialTerrain(r, new Vec3()), false);
  worker.onerror();
  assert.equal(prepareInitialTerrain(r, new Vec3()), true);
  assert.equal(worker.stopped, true);
});

test('the loading frame covers the previous terrain and resets stale per-frame timing without painting the old world', (t) => {
  const oldWorker = globalThis.Worker;
  globalThis.Worker = class {
    constructor() {
      return fakeWorker();
    }
  };
  t.after(() => {
    if (oldWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = oldWorker;
  });
  configureTerrain({ id: 'none' }, new Vec3(22000, 0, 0), () => 0.99);
  const paints = [],
    r = Object.assign(Object.create(Renderer.prototype), {
      backgroundTerrain: true,
      gpuModels: {},
      w: 800,
      h: 600,
      ctx: {
        fillRect(...args) {
          paints.push(args);
        },
        fillText() {},
      },
      terrainFrameMs: 999,
      terrainRebuilt: true,
      terrainSurface: ['previous-world'],
      terrainRevision: terrainWorld.revision - 1,
    });
  const state = createAircraft(aircraft.find((a) => a.id === 'f16'));
  r.render(state, [], {}, {});
  assert.equal(r.terrainPreparing, true);
  assert.equal(r.terrainFrameMs, 0);
  assert.equal(r.terrainRebuilt, false);
  assert.deepEqual(paints, [[0, 0, 800, 600]]);
});

test('the local terrain worker prepares only requested, allowlisted material chains for startup', () => {
  configureTerrain({ id: 'none' }, new Vec3(22000, 0, 0), () => 0.99);
  const data = prepareTerrain({
    key: 'material-startup',
    revision: terrainWorld.revision,
    world: terrainSnapshot(),
    cx: 0,
    cz: 0,
    wire: false,
    patches: [],
    materials: ['aircraft', 'concrete', 'aircraft'],
  });
  assert.deepEqual(
    data.materials.map((m) => m.kind),
    ['aircraft', 'concrete'],
  );
  for (const material of data.materials) {
    assert.equal(material.levels[0].width, 256);
    assert.equal(material.levels.at(-1).width, 1);
    assert.ok(material.levels.every((level) => level.pixels instanceof Uint8Array));
  }
  assert.throws(
    () =>
      prepareTerrain({
        key: 'bad-material',
        revision: terrainWorld.revision,
        world: terrainSnapshot(),
        cx: 0,
        cz: 0,
        materials: ['https://example.com/texture'],
      }),
    /Invalid prepared material/,
  );
  assert.throws(
    () =>
      prepareTerrain({
        key: 'too-many',
        revision: terrainWorld.revision,
        world: terrainSnapshot(),
        cx: 0,
        cz: 0,
        materials: Array(9).fill('concrete'),
      }),
    /Invalid geometry list/,
  );
});
