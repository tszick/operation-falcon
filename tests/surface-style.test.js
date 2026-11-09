import { createHash } from 'node:crypto';
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

test('allocation-free surface generation preserves every original material pixel', () => {
  const fixtures = {
    aircraft: {
      size: 256,
      sha256: '25eaae52138e9f98adffcfb477d65646fa1956e5eda51de870e84c0a5dd9a735',
    },
    camo: {
      size: 256,
      sha256: 'c9687d50bffd4d47c30cf24272b0cfe07e9c60f2719d07ad2c9977dd68878e7a',
    },
    concrete: {
      size: 256,
      sha256: 'fbe85fad2c36edb36731a6c352ea72a0753d1c4ce6f339f61259a3513ab4c96d',
    },
    hangar: {
      size: 512,
      sha256: 'c29bfaef962fba78d311a5843ca1619ebc69bac48dee57ad2822d50549fd86e9',
    },
    asphalt: {
      size: 256,
      sha256: '807bed1d87e46312a02ac68c5726abb0d903463d2d1a9092b70324cf819b580a',
    },
    terrain: {
      size: 256,
      sha256: 'c015abe9d40c8243dd35941090625107828acb84fa36a3094edbc588cd8e221c',
    },
    'terrain-sand': {
      size: 256,
      sha256: 'd7bbd4f760250616102069941b1f85bad126bbfb12688b1673355f2e5d968061',
    },
    'terrain-rock': {
      size: 256,
      sha256: '2f7f0fb5e76a314a5c17b193fb45d95626cebe283856a4a3b0f1fa7d7cca7fb4',
    },
    'terrain-sea': {
      size: 256,
      sha256: 'd51a63aa71a64e3df688ee3d52a37bbbf37e42ea8b8c558af8bb981146b668a1',
    },
    'terrain-snow': {
      size: 256,
      sha256: 'd7d3bb58d0a212ac0b246251b94e34f5cd6ac3f3b2b9c70fd6d7f2a8d52b32a0',
    },
    unknown: {
      size: 256,
      sha256: 'd39c04fb8e1d52a14022f1ce4e8882199a753a111c1f26429d010ed880941c43',
    },
  };
  for (const [kind, { size, sha256 }] of Object.entries(fixtures))
    assert.equal(
      createHash('sha256').update(materialPixels(kind, size)).digest('hex'),
      sha256,
      kind,
    );
});
