import test from 'node:test';
import assert from 'node:assert/strict';
import { withTerrainSnapshot, terrainHeight } from '../src/terrain.js';
import { buildTerrainSurface } from '../src/terrainSurface.js';
import { WebGPUBackend, projection } from '../src/rendering/webgpu/backend.js';
function meshHeight(faces, x, z) {
  let height = -Infinity;
  for (const {
    points: [a, b, c],
  } of faces) {
    const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    if (Math.abs(denominator) < 1e-8) continue;
    const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator;
    const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator;
    if (u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8)
      height = Math.max(height, u * a.y + v * b.y + (1 - u - v) * c.y);
  }
  return height;
}
test('home and rotated remote pavement remain above coarse terrain through camera LOD changes', () => {
  const field = { x: 17000, z: 23000, heading: 0.65, elevation: 150 };
  const world = { revision: 19813, skySeed: 417, peaks: [], airfields: [field] };
  withTerrainSnapshot(world, () => {
    for (const [cx, cz] of [
      [0, 0],
      [18000, 18000],
      [27000, 27000],
      [-18000, -18000],
    ]) {
      const faces = buildTerrainSurface(cx, cz);
      for (const f of [{ x: 0, z: 0, heading: 0, elevation: 0 }, field])
        for (const lateral of [-44, 0, 44])
          for (const along of [-1599, -800, 0, 800, 1599]) {
            const x = f.x + lateral * Math.cos(f.heading) + along * Math.sin(f.heading);
            const z = f.z - lateral * Math.sin(f.heading) + along * Math.cos(f.heading);
            assert.ok(Math.abs(terrainHeight(x, z) - f.elevation) < 1e-7);
            const rendered = meshHeight(faces, x, z);
            assert.ok(Number.isFinite(rendered), 'runway is inside the rendered terrain');
            assert.ok(
              rendered < f.elevation + 0.18,
              `${cx},${cz}: terrain ${rendered} buries pavement at ${x},${z}`,
            );
          }
    }
  });
});
test('surface depth bias separates quantized asphalt and paint while keeping depth tests and writes enabled', () => {
  const [, , a, b] = projection(600, 1200, 800);
  const quantize = (distance) => Math.round((a + b / distance) * (2 ** 24 - 1));
  assert.equal(
    quantize(10000),
    quantize(9999.92),
    'physical paint height alone does not separate distant 24-bit depth values',
  );
  const old = globalThis.GPUColorWrite;
  globalThis.GPUColorWrite = { ALL: 15 };
  try {
    const backend = Object.assign(Object.create(WebGPUBackend.prototype), {
      layout: {},
      surface: { runtime: { format: 'bgra8unorm' } },
      device: {
        createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
        createPipelineLayout: (v) => v,
        createRenderPipeline: (v) => v,
      },
    });
    const asphalt = backend.pipeline('', [], { bias: -4 }).depthStencil;
    const paint = backend.pipeline('', [], { bias: -8 }).depthStencil;
    assert.ok(paint.depthBias < asphalt.depthBias && asphalt.depthBias < 0);
    assert.equal(asphalt.depthCompare, 'less-equal');
    assert.equal(paint.depthCompare, 'less-equal');
    assert.equal(asphalt.depthWriteEnabled, true);
    assert.equal(paint.depthWriteEnabled, true);
  } finally {
    if (old === undefined) delete globalThis.GPUColorWrite;
    else globalThis.GPUColorWrite = old;
  }
});
