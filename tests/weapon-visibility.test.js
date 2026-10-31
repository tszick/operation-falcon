import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from '../src/math.js';
import { renderWeapons } from '../src/weaponRenderer.js';
import { rgba } from '../src/rendering/shared/shapes.js';
import { configureTerrain, terrainHeight } from '../src/terrain.js';
import { clearWeaponLine, stepMissile, weaponProfiles } from '../src/weaponDynamics.js';
test('accelerated weapon terrain checks exactly preserve the original samples and two-metre clearance', () => {
  let seed = 827;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const reference = (a, b) => {
    const distance = a.distance(b),
      steps = Math.min(100, Math.max(6, Math.ceil(distance / 250)));
    for (let i = 1; i < steps; i++) {
      const p = a.clone().add(
        b
          .clone()
          .sub(a)
          .scale(i / steps),
      );
      if (p.y < terrainHeight(p.x, p.z) + 2) return false;
    }
    return true;
  };
  for (const id of ['none', 'bunker', 'bridge', 'canyon']) {
    configureTerrain({ id }, new Vec3(12000, 0, 14000), random);
    for (let i = 0; i < 200; i++) {
      const a = new Vec3(random() * 40000 - 8000, random() * 3500, random() * 40000 - 8000),
        b = new Vec3(random() * 40000 - 8000, random() * 3500, random() * 40000 - 8000);
      assert.equal(clearWeaponLine(a, b), reference(a, b), id + '/' + i);
    }
  }
});
test('an autonomous IR seeker does not calculate unused launch-radar support', () => {
  configureTerrain({ id: 'none' }, new Vec3(22000, 0, 0), () => 0.99);
  const profile = weaponProfiles.aim9m,
    p = {
      profile,
      position: new Vec3(0, 3000, 100),
      velocity: new Vec3(0, 0, 400),
      age: 1,
      travelled: 300,
    },
    target = { position: new Vec3(0, 3000, 3000), velocity: new Vec3(0, 0, 100) },
    launcher = {
      position: new Vec3(0, 3000, 0),
      get spec() {
        throw new Error('IR must not inspect radar support');
      },
    };
  stepMissile(p, target, launcher, 1 / 120);
  assert.equal(p.seekerLost, undefined);
  assert.ok(Number.isFinite(p.velocity.z));
});

test('missile smoke fades monotonically through its final 120 Hz lifetime tick without flashing', () => {
  const trail = {
    from: new Vec3(0, 1000, 100),
    to: new Vec3(0, 1000, 120),
    life: 3.5,
    maxLife: 3.5,
  };
  const alphas = [];
  const ctx = {
    beginPath() {},
    stroke() {
      alphas.push(rgba(this.strokeStyle)[3]);
    },
  };
  const renderer = { ctx, line() {} };
  for (let i = 0; i <= 420; i++) {
    renderWeapons(renderer, {}, { trails: [trail], projectiles: [], effects: [] });
    trail.life -= 1 / 120;
  }
  assert.equal(alphas.length, 421);
  for (let i = 1; i < alphas.length; i++) {
    assert.ok(alphas[i] <= alphas[i - 1], `smoke brightened at tick ${i}: ${alphas[i]}`);
    assert.ok(alphas[i] >= 0);
  }
  assert.ok(
    alphas.at(-1) < 1e-12,
    'the last visible smoke segment must stay effectively transparent',
  );
});
