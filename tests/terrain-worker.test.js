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
  assert.deepEqual(actual.mask, expected.mask);
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
