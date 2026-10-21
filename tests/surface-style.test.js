import test from 'node:test';
import assert from 'node:assert/strict';
import {
  materialPixels,
  SurfaceTextures,
  surfaceStyle,
  materialFor,
  surfaceStyles,
  terrainTint,
} from '../src/surfaceStyle.js';
test('generated surface tiles are deterministic, opaque and small enough to reuse without geometry changes', () => {
  for (const kind of ['aircraft', 'camo', 'concrete', 'hangar', 'terrain']) {
    const a = materialPixels(kind);
    assert.deepEqual(a, materialPixels(kind));
    assert.equal(a.length, 256 * 256 * 4);
    for (let i = 3; i < a.length; i += 4) assert.equal(a[i], 255);
    assert.ok(new Set(a).size > 8);
  }
});
test('surface textures upload and build mipmaps once per material, then reuse the same GPU texture', () => {
  let uploads = 0,
    mips = 0,
    allocations = 0;
  const gl = {
    createTexture: () => ({ id: ++allocations }),
    activeTexture: () => {},
    bindTexture: () => {},
    texImage2D: () => uploads++,
    generateMipmap: () => mips++,
    texParameteri: () => {},
  };
  const textures = new SurfaceTextures(gl);
  for (let i = 0; i < 120; i++) {
    textures.bind('aircraft');
    textures.bind('camo');
  }
  assert.equal(uploads, 2);
  assert.equal(mips, 2);
  assert.equal(allocations, 2);
});
test('unknown saved palettes fall back safely; model roles choose aircraft, military camouflage and concrete', () => {
  assert.equal(surfaceStyle('obsolete'), surfaceStyle('vector'));
  assert.equal(surfaceStyle('grass').stars, 0);
  assert.equal(surfaceStyle('night').stars, 1);
  assert.equal(materialFor('air'), 'aircraft');
  assert.equal(materialFor('sam-system'), 'camo');
  assert.equal(materialFor('city-building'), 'concrete');
});

test('all scenery profiles have finite bounded colours, safe snow blends and cached terrain textures', () => {
  for (const [id, p] of Object.entries(surfaceStyles)) {
    assert.equal(p.sky.length, 3);
    assert.ok(p.sky.every((c) => /^#[0-9a-f]{6}$/i.test(c)));
    assert.ok(p.textureScale > 0 && p.hazeDistance > 0 && p.snowRange > 0);
    for (const normal of [0, 0.4, 0.8, 1])
      for (const altitude of [-500, 0, 1500, 9000]) {
        const rgb = terrainTint(id, normal, altitude, 0.7);
        assert.equal(rgb.length, 3);
        assert.ok(rgb.every((v) => Number.isFinite(v) && v >= 0 && v <= 1));
      }
  }
  for (const kind of ['terrain-sand', 'terrain-rock', 'terrain-snow']) {
    assert.deepEqual(materialPixels(kind), materialPixels(kind));
    assert.notDeepEqual(materialPixels(kind), materialPixels('terrain'));
  }
});
test('winter covers gentle ground with snow while steep cliffs expose rock; mountain snow depends on elevation', () => {
  const flat = terrainTint('winter', 1, 100, 0.8),
    cliff = terrainTint('winter', 0.1, 100, 0.8);
  assert.ok(flat[0] > cliff[0] * 1.5);
  const valley = terrainTint('rocky', 1, 100, 0.8),
    summit = terrainTint('rocky', 1, 2500, 0.8);
  assert.ok(summit[0] > valley[0] * 1.5);
  assert.equal(surfaceStyle('winter').stars, 0);
  assert.equal(surfaceStyle('winter').clouds, true);
  assert.equal(surfaceStyle('sunset').sun, true);
});
