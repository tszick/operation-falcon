import { homography, matrix3d } from '../src/cockpitGeometry.js';
import { materialMipmaps } from '../src/rendering/shared/materialMipmaps.js';
import { materialPixels } from '../src/rendering/shared/materialPixels.js';
import { TextureUpload } from '../src/rendering/webgpu/textureUpload.js';
import { WebGPUBackend } from '../src/rendering/webgpu/backend.js';
import { configureTerrain, terrainWorld } from '../src/terrain.js';
import { farmlandSize } from '../src/farmland.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { projection, paddedMatrix } from '../src/rendering/webgpu/backend.js';
import { triangulate, rgba, multiply, transformPoint } from '../src/rendering/shared/shapes.js';
import { rotationMatrix, meshBounds } from '../src/rendering/shared/meshData.js';
import { VectorContext } from '../src/rendering/webgpu/vectorContext.js';
import { Quat, Vec3 } from '../src/math.js';

test('GPU culling bounds enclose every vertex, including planar meshes and separate geometry snapshots', () => {
  const mesh = { points: [new Vec3(-3, 2, 4), new Vec3(6, 2, -8)] };
  const bounds = meshBounds(mesh);
  assert.deepEqual(bounds.mins, [-3, 2, -8]);
  assert.deepEqual(bounds.sizes, [9, 0.01, 12]);
  for (const p of mesh.points) assert.ok(bounds.radius >= p.length());
  assert.equal(meshBounds(mesh), bounds);
  const changed = { points: [...mesh.points, new Vec3(0, 0, 20)] };
  assert.equal(meshBounds(changed).radius, 20);
  assert.equal(meshBounds(mesh).radius, bounds.radius);
});

test('retained HUD panels preserve draw order and physical pixel coordinates without disturbing pending geometry', () => {
  const context = Object.assign(Object.create(VectorContext.prototype), {
    canvas: { width: 200, height: 100 },
    coordinateScale: 2,
    globalAlpha: 1,
    matrix: [1, 0, 0, 1, 0, 0],
    projective: null,
    vertices: [],
    batches: [],
    clipRect: [0, 0, 200, 100],
    surface: { schedule() {} },
  });
  const points = [
    [0, 0],
    [100, 0],
    [0, 50],
  ];
  context.triangles(points, '#ff0000');
  const record = context.capture(() => context.triangles(points, '#00ff00'));
  assert.equal(context.vertices.length, 27);
  assert.deepEqual(
    [record.vertices[0], record.vertices[1], record.vertices[9], record.vertices[10]],
    [-1, 1, 1, 1],
  );
  context.replay(record);
  assert.deepEqual(
    context.batches.map((batch) => batch.first),
    [0, 3],
  );
  assert.deepEqual(context.vertices.slice(29, 33), [0, 1, 0, 1]);
  const animated = context.capture(() => context.replay(record, { x: 20, y: 10, alpha: 0.25 }));
  assert.deepEqual(animated.vertices.slice(0, 2), [-0.8, 0.8]);
  assert.equal(animated.vertices[5], 0.25);
  assert.deepEqual(animated.batches[0].clip, [0, 0, 200, 100]);
  assert.equal(record.vertices[5], 1);
  assert.throws(
    () =>
      context.capture(() => {
        throw new Error('panel failed');
      }),
    /panel failed/,
  );
  assert.equal(context.vertices.length, 54);
});

test('WebGPU projection preserves the camera while mapping the near and far planes to zero and one', () => {
  const near = 1,
    far = 200000,
    p = projection(576, 1280, 720, near, far);
  assert.ok(Math.abs((p[2] * near + p[3]) / near) < 1e-12);
  assert.ok(Math.abs((p[2] * far + p[3]) / far - 1) < 1e-12);
  const x = 80,
    y = -30,
    z = 600;
  assert.ok(Math.abs(((x * p[0]) / z + 1) * 640 - (640 + (x * 576) / z)) < 1e-9);
  assert.ok(Math.abs((1 - ((y * p[1]) / z - 0.06)) * 360 - (720 * 0.53 - (y * 576) / z)) < 1e-9);
});
test('WGSL matrix padding keeps quaternion rotations unchanged and does not pack columns at twelve bytes', () => {
  const q = Quat.euler(0.4, -0.6, 0.2),
    p = new Vec3(3, 5, -8),
    m = paddedMatrix(rotationMatrix(q)),
    expected = q.rotate(p);
  assert.equal(m.length, 12);
  assert.deepEqual([m[3], m[7], m[11]], [0, 0, 0]);
  for (const [i, k] of ['x', 'y', 'z'].entries())
    assert.ok(Math.abs(m[i] * p.x + m[i + 4] * p.y + m[i + 8] * p.z - expected[k]) < 1e-5);
});
test('HUD tessellation preserves a concave polygon area in either winding, including repeated closing vertices', () => {
  const shape = [
    [0, 0],
    [6, 0],
    [6, 2],
    [2, 2],
    [2, 6],
    [0, 6],
    [0, 0],
  ];
  for (const points of [shape, [...shape].reverse()]) {
    const triangles = triangulate(points);
    let area = 0;
    for (let i = 0; i < triangles.length; i += 3) {
      const [a, b, c] = triangles.slice(i, i + 3);
      area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    }
    assert.equal(area, 20);
  }
  assert.deepEqual(
    triangulate([
      [0, 0],
      [0, 0],
      [1, 0],
      [2, 0],
    ]),
    [],
  );
});
test('GPU HUD colour parsing preserves alpha and cockpit integrity colours', () => {
  assert.deepEqual(rgba('#abcdef80'), [171 / 255, 205 / 255, 239 / 255, 128 / 255]);
  assert.deepEqual(rgba('rgba(10,20,30,0.25)'), [10 / 255, 20 / 255, 30 / 255, 0.25]);
  assert.deepEqual(rgba('none'), [0, 0, 0, 0]);
  const color = rgba('hsl(0 100% 50%)');
  assert.deepEqual(color, [1, 0, 0, 1]);
});
test('2D transform composition preserves instrument positions under translation, rotation and scale', () => {
  const angle = 0.35,
    rotation = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0],
    matrix = multiply([1, 0, 0, 1, 40, 90], multiply(rotation, [2, 0, 0, 3, 0, 0]));
  const point = transformPoint(matrix, 5, 7);
  assert.ok(Math.abs(point[0] - (40 + 10 * Math.cos(angle) - 21 * Math.sin(angle))) < 1e-9);
  assert.ok(Math.abs(point[1] - (90 + 10 * Math.sin(angle) + 21 * Math.cos(angle))) < 1e-9);
});

test('GPU colour parsing keeps signed scientific notation in RGB and HSL components', () => {
  assert.deepEqual(rgba('rgba(1e2,2E+1,3e+1,1e-7)'), [100 / 255, 20 / 255, 30 / 255, 1e-7]);
  assert.deepEqual(rgba('hsla(0,100%,50%,7.9e-16)'), [1, 0, 0, 7.9e-16]);
  assert.deepEqual(rgba('rgba(10,20,30,.25)'), [10 / 255, 20 / 255, 30 / 255, 0.25]);
});

test('GPU vertex uploads reuse staging capacity, copy exact active bytes and preserve earlier queued panels', () => {
  const writes = [],
    context = Object.assign(Object.create(VectorContext.prototype), {
      surface: {
        device: {
          queue: {
            writeBuffer(target, offset, data, start, bytes) {
              writes.push({
                target,
                offset,
                values: [...new Float32Array(data.slice(start, start + bytes))],
              });
            },
          },
        },
      },
    }),
    panel = {},
    world = {};
  context.uploadVertices(panel, [1.25, 2.5, 3.75]);
  const first = context.uploadStaging;
  context.uploadVertices(world, [9]);
  assert.equal(context.uploadStaging, first);
  assert.deepEqual(writes[0], { target: panel, offset: 0, values: [1.25, 2.5, 3.75] });
  assert.deepEqual(writes[1], { target: world, offset: 0, values: [9] });
  const large = Array.from({ length: first.length + 1 }, (_, i) => i / 2);
  context.uploadVertices(world, large);
  assert.notEqual(context.uploadStaging, first);
  assert.ok(context.uploadStaging.length >= large.length);
  assert.deepEqual(writes[2].values, large);
  const grown = context.uploadStaging;
  context.uploadVertices(panel, [4, 5]);
  assert.equal(context.uploadStaging, grown);
  assert.deepEqual(writes[3].values, [4, 5]);
  assert.deepEqual(writes[0].values, [1.25, 2.5, 3.75]);
});

test('large texture transfers preserve row offsets and the final partial strip without copying the source array', () => {
  const pixels = Uint8Array.from({ length: 3 * 5 * 4 }, (_, i) => i),
    writes = [],
    texture = {};
  const upload = new TextureUpload(texture, pixels, 3, 5, 2);
  const queue = {
    writeTexture(destination, data, layout, size) {
      writes.push({ destination, data, layout, size });
    },
  };
  assert.equal(upload.step(queue), false);
  assert.equal(upload.step(queue), false);
  assert.equal(upload.step(queue), true);
  assert.equal(upload.step(queue), true);
  assert.equal(writes.length, 3);
  assert.deepEqual(
    writes.map((w) => w.destination.origin),
    [
      [0, 0, 0],
      [0, 2, 0],
      [0, 4, 0],
    ],
  );
  assert.deepEqual(
    writes.map((w) => w.layout.offset),
    [0, 24, 48],
  );
  assert.deepEqual(
    writes.map((w) => w.size),
    [
      [3, 2, 1],
      [3, 2, 1],
      [3, 1, 1],
    ],
  );
  for (const w of writes) {
    assert.equal(w.data, pixels);
    assert.equal(w.destination.texture, texture);
    assert.equal(w.layout.bytesPerRow, 12);
  }
});

test('GPU startup hides a partially uploaded atlas, releases CPU pixels after completion and restarts for a new world', () => {
  const writes = [],
    backend = Object.assign(Object.create(WebGPUBackend.prototype), {
      ready: true,
      surface: {},
      farmlandTexture: {},
      device: {
        queue: {
          writeTexture(...args) {
            writes.push(args);
          },
        },
      },
    });
  configureTerrain({ id: 'none' }, new Vec3(22000, 0, 0), () => 0.99);
  const r = {
    terrainFarmlandRevision: terrainWorld.revision,
    terrainFarmland: new Uint8Array(farmlandSize * farmlandSize * 4),
  };
  assert.equal(backend.prepareEnvironment(r), false);
  assert.notEqual(backend.farmlandWorld, terrainWorld);
  const firstSource = r.terrainFarmland;
  configureTerrain({ id: 'none' }, new Vec3(22000, 0, 0), () => 0.5);
  r.terrainFarmlandRevision = terrainWorld.revision;
  r.terrainFarmland = new Uint8Array(farmlandSize * farmlandSize * 4);
  assert.equal(backend.prepareEnvironment(r), false);
  assert.deepEqual(writes.at(-1)[0].origin, [0, 0, 0]);
  assert.notEqual(writes.at(-1)[1], firstSource);
  for (let i = 1; i < farmlandSize / 128 - 1; i++)
    assert.equal(backend.prepareEnvironment(r), false);
  assert.equal(backend.prepareEnvironment(r), true);
  assert.equal(backend.farmlandWorld, terrainWorld);
  assert.equal(r.terrainFarmland, null);
  assert.equal(backend.farmlandUpload, null);
  const count = writes.length;
  assert.equal(backend.prepareEnvironment(r), true);
  assert.equal(writes.length, count);
});

test('prepared material mipmaps preserve every byte of the original box-filter chain', () => {
  for (const kind of [
    'hangar',
    'aircraft',
    'camo',
    'asphalt',
    'terrain-rock',
    'terrain-sand',
    'concrete',
  ]) {
    const size = kind === 'hangar' ? 512 : 256,
      levels = materialMipmaps(kind, size);
    let width = size,
      pixels = materialPixels(kind, size);
    for (const level of levels) {
      assert.equal(level.width, width);
      assert.deepEqual(level.pixels, pixels, kind + ':' + width);
      if (width === 1) break;
      const next = new Uint8Array(width * width),
        n = width / 2;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++)
          for (let c = 0; c < 4; c++) {
            const i = (y * 2 * width + x * 2) * 4 + c;
            next[(y * n + x) * 4 + c] =
              (pixels[i] + pixels[i + 4] + pixels[i + width * 4] + pixels[i + width * 4 + 4]) / 4;
          }
      pixels = next;
      width = n;
    }
    assert.equal(levels.length, Math.log2(size) + 1);
    assert.equal(levels.at(-1).pixels.length, 4);
  }
});

test('startup uploads one already prepared material per frame without regenerating or retaining its pixels', (t) => {
  const originalUsage = globalThis.GPUTextureUsage;
  globalThis.GPUTextureUsage = { TEXTURE_BINDING: 1, COPY_DST: 2 };
  t.after(() => {
    if (originalUsage === undefined) delete globalThis.GPUTextureUsage;
    else globalThis.GPUTextureUsage = originalUsage;
  });
  configureTerrain({ id: 'none' }, new Vec3(22000, 0, 0), () => 0.99);
  const uploads = [],
    textures = [],
    atlas = {},
    backend = Object.assign(Object.create(WebGPUBackend.prototype), {
      ready: true,
      surface: {},
      textures: new Map(),
      farmlandTexture: atlas,
      device: {
        createTexture(options) {
          const texture = { options };
          textures.push(texture);
          return texture;
        },
        queue: {
          writeTexture(...args) {
            uploads.push(args);
          },
        },
      },
    });
  const prepared = ['concrete', 'aircraft'].map((kind, i) => ({
    kind,
    levels: [
      { width: 2, pixels: new Uint8Array(16).fill(i + 1) },
      { width: 1, pixels: new Uint8Array(4).fill(i + 2) },
    ],
  }));
  const r = {
    terrainMaterialRevision: terrainWorld.revision,
    terrainMaterials: prepared,
    terrainFarmlandRevision: terrainWorld.revision,
    terrainFarmland: new Uint8Array(farmlandSize * farmlandSize * 4),
  };
  assert.equal(backend.prepareEnvironment(r), false);
  assert.equal(textures.length, 1);
  assert.equal(r.terrainMaterials, null);
  assert.equal(backend.preparedTextures.size, 1);
  assert.equal(backend.prepareEnvironment(r), false);
  assert.equal(textures.length, 2);
  assert.equal(backend.preparedTextures.size, 0);
  for (let i = 2; i < 16; i++) backend.prepareEnvironment(r);
  assert.equal(backend.farmlandWorld, terrainWorld);
  assert.equal(textures.length, 2);
  assert.deepEqual(
    textures.map((texture) => texture.options.size),
    [
      [2, 2],
      [2, 2],
    ],
  );
  const materialWrites = uploads.filter((args) => args[0].texture !== atlas);
  assert.equal(materialWrites.length, 4);
  assert.equal(materialWrites[0][1], prepared[0].levels[0].pixels);
  assert.equal(materialWrites[1][1], prepared[0].levels[1].pixels);
  assert.equal(materialWrites[2][1], prepared[1].levels[0].pixels);
  assert.equal(r.terrainFarmland, null);
  assert.equal(backend.texture('concrete'), textures[0]);
  assert.equal(textures.length, 2);
});

function projectedContext(matrix) {
  return Object.assign(Object.create(VectorContext.prototype), {
    canvas: { width: 1000, height: 600 },
    coordinateScale: 1,
    globalAlpha: 0.5,
    matrix: [1, 0, 0, 1, 0, 0],
    projective: matrix,
    vertices: [],
    batches: [],
    clipRect: null,
    surface: { schedule() {} },
  });
}
test('direct cockpit projection preserves every corner of a tilted display, UVs, colour and alpha', () => {
  const corners = [
      [30, 50],
      [880, 110],
      [830, 520],
      [100, 570],
    ],
    h = homography(100, 100, corners);
  const values = matrix3d(h),
    matrix = {};
  for (let column = 1; column <= 4; column++)
    for (let row = 1; row <= 4; row++)
      matrix[`m${column}${row}`] = values[(column - 1) * 4 + row - 1];
  matrix.transformPoint = () => {
    throw new Error('native point allocation used');
  };
  const ctx = projectedContext(matrix),
    points = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 0],
      [100, 100],
      [0, 100],
    ],
    ids = [0, 1, 2, 0, 2, 3];
  const uv = points.map(([x, y]) => [x / 100, y / 100]);
  ctx.triangles(points, 'rgba(100,150,200,0.8)', { uv, mode: 6 });
  for (let i = 0; i < points.length; i++) {
    const vertex = ctx.vertices.slice(i * 9, i * 9 + 9),
      expected = corners[ids[i]];
    assert.ok(Math.abs(vertex[0] - ((expected[0] / 1000) * 2 - 1)) < 1e-10);
    assert.ok(Math.abs(vertex[1] - (1 - (expected[1] / 600) * 2)) < 1e-10);
    assert.deepEqual(vertex.slice(2), [100 / 255, 150 / 255, 200 / 255, 0.4, ...uv[i], 6]);
  }
  assert.equal(ctx.batches[0].count, 6);
});

test('projective coefficients are read again after a matrix mutation and custom point transforms retain their fallback', (t) => {
  const matrix = { m11: 1, m21: 0, m41: 10, m12: 0, m22: 1, m42: 20, m14: 0, m24: 0, m44: 1 };
  const ctx = projectedContext(matrix);
  ctx.triangles([[1, 2]], '#fff');
  const before = ctx.vertices[0];
  matrix.m41 += 50;
  ctx.triangles([[1, 2]], '#fff');
  assert.ok(Math.abs(ctx.vertices[9] - before - 0.1) < 1e-12);
  const previousPoint = globalThis.DOMPoint;
  globalThis.DOMPoint = class {
    constructor(x, y) {
      Object.assign(this, { x, y });
    }
  };
  t.after(() => {
    if (previousPoint === undefined) delete globalThis.DOMPoint;
    else globalThis.DOMPoint = previousPoint;
  });
  let calls = 0;
  ctx.projective = {
    transformPoint(p) {
      calls++;
      return { x: p.x + 4, y: p.y + 8, w: 2 };
    },
  };
  ctx.triangles([[1, 2]], '#fff');
  assert.equal(calls, 1);
  assert.equal(ctx.vertices[18], (2.5 / 1000) * 2 - 1);
  assert.equal(ctx.vertices[19], 1 - (5 / 600) * 2);
});
