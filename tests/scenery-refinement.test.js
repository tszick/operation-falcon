import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { terrainPeakHeight, configureTerrain, terrainHeight } from '../src/terrain.js';
import { taiwanMission } from '../src/taiwanMission.js';
import { readTerrainSnapshot } from '../src/terrainSnapshot.js';
import { islandGeometry } from '../src/oceanEnvironment.js';
import { cloudViewTransform } from '../src/clouds.js';
import { Renderer } from '../src/renderer.js';
import { Vec3, Quat } from '../src/math.js';
import { hudViewTransform, hudSourcePoint } from '../src/cockpitGeometry.js';
import { skyTexture } from '../src/skyTextures.js';

test('Aster rocky summits share their exact collision surface with worker snapshots and preserve the runway', () => {
  const world = configureTerrain(taiwanMission),
    snapshot = readTerrainSnapshot(world);
  assert.equal(terrainHeight(0, 0), 650);
  const rocks = world.islands.slice(1);
  assert.equal(rocks.length, 3);
  for (const rock of rocks) {
    assert.ok(terrainHeight(rock.x, rock.z) > 1200);
    assert.ok(rock.landColor.every((c) => c >= 100 && c <= 140));
    assert.deepEqual(
      snapshot.islands.find((i) => i.x === rock.x && i.z === rock.z),
      rock,
    );
  }
});

test('compact rock outcrops have a bounded jagged footprint and broad hills retain their old profile', () => {
  const rock = { x: 100, z: 200, height: 1800, radius: 1200, platform: 0 };
  assert.equal(terrainPeakHeight(rock, 100, 200), 1800);
  assert.equal(terrainPeakHeight(rock, 2000, 200), 0);
  const hill = { ...rock, radius: 3000 };
  assert.ok(
    Math.abs(terrainPeakHeight(hill, 1300, 200) - 1800 * Math.exp(-2.8 * (1200 / 3000) ** 2)) <
      1e-9,
  );
});

test('sky assets are local PNG textures with real cloud alpha and a single retained image per kind', (t) => {
  const old = globalThis.Image;
  let created = 0;
  globalThis.Image = class {
    constructor() {
      created++;
      this.complete = true;
      this.naturalWidth = 1774;
    }
  };
  t.after(() => {
    if (old === undefined) delete globalThis.Image;
    else globalThis.Image = old;
  });
  const cloud = skyTexture('cloud'),
    night = skyTexture('night');
  assert.equal(skyTexture('cloud'), cloud);
  assert.equal(skyTexture('night'), night);
  assert.equal(created, 2);
  for (const image of [cloud, night]) {
    assert.ok(image.src.startsWith('/assets/environment/'));
    const data = readFileSync(new URL('..' + image.src, import.meta.url));
    assert.equal(data.subarray(1, 4).toString(), 'PNG');
    if (image === cloud) assert.equal(data[25], 6, 'cloud texture must have an alpha channel');
  }
});

test('Aster rock skirts inherit the ground colour rather than the island beach sand', () => {
  for (const rock of taiwanMission.battlefield.environment.islands.filter((i) => i.rocky))
    for (const face of islandGeometry(rock).faces.filter((f) => f.center.y > 0)) {
      const [red, green] = face.color.match(/\d+/g).map(Number);
      assert.ok(green >= red, face.color);
    }
});

test('cloud tangent planes keep their world centre and projected edges through yaw, pitch and bank', () => {
  const cloud = { bearing: 0.4, elevation: 0.5, size: 0.2 };
  for (const [yaw, pitch, bank] of [
    [0, 0, 0],
    [0.4, 0.3, 0.2],
    [-0.3, -0.2, -0.4],
  ]) {
    const r = Object.assign(Object.create(Renderer.prototype), { w: 1280, h: 720, focal: 576 });
    r.setup(new Vec3(100, 200, 300), Quat.euler(yaw, pitch, bank));
    const b = cloud.bearing,
      e = cloud.elevation;
    const dir = new Vec3(Math.sin(b) * Math.cos(e), Math.sin(e), Math.cos(b) * Math.cos(e));
    const right = new Vec3(Math.cos(b), 0, -Math.sin(b)),
      up = dir.cross(right);
    const matrix = cloudViewTransform(r, cloud);
    for (const [x, y, v] of [
      [0, 0, dir],
      [0.5, 0, dir.clone().add(right.scale(cloud.size * 0.5))],
      [0, -0.25, dir.clone().add(up.scale(cloud.size * 0.25))],
    ]) {
      const expected = r.project(r.camera.clone().add(v.clone().scale(100000)));
      assert.ok(Math.abs(matrix[0] * x + matrix[2] * y + matrix[4] - expected.x) < 1e-8);
      assert.ok(Math.abs(matrix[1] * x + matrix[3] * y + matrix[5] - expected.y) < 1e-8);
    }
  }
});

test('HUD projection and inverse keep world-space flight markers fixed while the head moves', () => {
  for (const yaw of [-0.8, 0, 0.8])
    for (const pitch of [-0.4, 0, 0.4]) {
      const matrix = hudViewTransform(1280, 720, yaw, pitch, [0, 0.15, 0.1]);
      for (const point of [
        { x: 430, y: 280 },
        { x: 810, y: 500 },
      ]) {
        const source = hudSourcePoint(matrix, point);
        assert.ok(
          Math.abs(
            (matrix[0] * source.x + matrix[4] * source.y + matrix[12]) /
              (matrix[3] * source.x + matrix[7] * source.y + matrix[15]) -
              point.x,
          ) < 1e-8,
        );
        assert.ok(
          Math.abs(
            (matrix[1] * source.x + matrix[5] * source.y + matrix[13]) /
              (matrix[3] * source.x + matrix[7] * source.y + matrix[15]) -
              point.y,
          ) < 1e-8,
        );
      }
    }
});

test('HUD display and glass corners share the exact world projection through head rotation and leaning', async () => {
  const { hudGlassScreenPoints, hudGlassPoints } = await import('../src/hudGlassGeometry.js');
  const { cabinEyeOffset } = await import('../src/cockpitInteriorGeometry.js');
  for (const [width, height] of [
    [960, 720],
    [1600, 900],
  ])
    for (const yaw of [-1.5, -0.6, 0, 0.6, 1.5])
      for (const pitch of [-0.6, 0, 0.7]) {
        const eye = cabinEyeOffset(pitch),
          matrix = hudViewTransform(width, height, yaw, pitch, eye),
          q = Quat.euler(yaw, pitch, 0),
          f = height * 0.8,
          corners = hudGlassPoints(width / height);
        for (const [i, [x, y]] of hudGlassScreenPoints(width, height).entries()) {
          const actualW = matrix[3] * x + matrix[7] * y + matrix[15],
            point = new Vec3(...corners[i]).sub(new Vec3(...eye)),
            depth = point.dot(q.rotate(new Vec3(0, 0, 1)));
          assert.ok(Math.abs(actualW - depth) < 1e-8);
          if (depth < 0.04) continue;
          const actualX = (matrix[0] * x + matrix[4] * y + matrix[12]) / actualW,
            actualY = (matrix[1] * x + matrix[5] * y + matrix[13]) / actualW;
          assert.ok(
            Math.abs(
              actualX - (width * 0.5 + (f * point.dot(q.rotate(new Vec3(1, 0, 0)))) / depth),
            ) < 1e-6,
          );
          assert.ok(
            Math.abs(
              actualY - (height * 0.53 - (f * point.dot(q.rotate(new Vec3(0, 1, 0)))) / depth),
            ) < 1e-6,
          );
        }
      }
});

test('HUD value boxes stay inside the glass on compact and wide displays', async () => {
  const { hudTapeSpan, cockpitHudFooterY } = await import('../src/cockpitGeometry.js');
  const { hudGlassScreenPoints } = await import('../src/hudGlassGeometry.js');
  for (const [w, h] of [
    [800, 600],
    [1280, 720],
    [1600, 900],
    [1920, 1080],
  ]) {
    const glass = hudGlassScreenPoints(w, h),
      span = hudTapeSpan(w);
    assert.ok(w * 0.5 - span - 38 > glass[0][0]);
    assert.ok(w * 0.5 + span + 38 < glass[1][0]);
    assert.ok(cockpitHudFooterY(w, h) + 20 < glass[2][1]);
  }
});
