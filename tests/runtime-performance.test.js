import { renderWeapons } from '../src/weaponRenderer.js';
import { Vec3, Quat } from '../src/math.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedRgba, rgba } from '../src/rendering/shared/shapes.js';
import { WebGPUBackend } from '../src/rendering/webgpu/backend.js';
import { forestPatches, forestCanopyFaces } from '../src/forests.js';
import { aircraft, missions } from '../src/aircraftSpec.js';
import { createAircraft } from '../src/physics.js';
import { FlightRecorder } from '../src/flightRecorder.js';
import { Mission } from '../src/mission.js';
import { Weapons } from '../src/weapons.js';
import { Targeting } from '../src/targeting.js';

test('cached paint colours preserve tiny alpha, cannot contaminate subsequent draws and evict transient colours', () => {
  const first = cachedRgba('#64d7ff');
  assert.equal(first, cachedRgba('#64d7ff'));
  assert.throws(() => {
    first[3] = 0;
  });
  const original = rgba('#64d7ff');
  original[0] = 0;
  assert.equal(cachedRgba('#64d7ff')[0], 100 / 255);
  assert.deepEqual(cachedRgba('rgba(10,20,30,7.9e-16)'), rgba('rgba(10,20,30,7.9e-16)'));
  for (let i = 0; i < 1400; i++) cachedRgba(`rgba(10,20,30,${i / 2000})`);
  assert.notEqual(first, cachedRgba('#64d7ff'));
  assert.deepEqual(first, cachedRgba('#64d7ff'));
});

test('draw uniforms reuse allocations between frames without changing previously staged draw data', () => {
  const backend = Object.create(WebGPUBackend.prototype);
  Object.assign(backend, {
    drawUniforms: [],
    drawUniformCount: 0,
    uniformCount: 0,
    uniformStride: 512,
    uniformStaging: new Float32Array(512),
  });
  const base = new Float32Array(80);
  base[24] = 12;
  const first = backend.drawUniform(base),
    second = backend.drawUniform(base);
  assert.notEqual(first, second);
  first[24] = 33;
  backend.uniform(first);
  first[24] = 99;
  assert.equal(backend.uniformStaging[24], 33);
  backend.drawUniformCount = 0;
  base[24] = 7;
  const reused = backend.drawUniform(base);
  assert.equal(first, reused);
  assert.equal(reused[24], 7);
  assert.equal(second[24], 12);
});

test('forest analytic samples survive camera movement while draping follows the current mesh and world changes invalidate samples', () => {
  const world = { revision: 42, skySeed: 417, peaks: [] },
    p = forestPatches(world).at(-1);
  let queries = 0;
  const heightAt = () => {
    queries++;
    return 80;
  };
  const first = forestCanopyFaces(p.x, p.z, world, heightAt, () => 80),
    initial = queries;
  const second = forestCanopyFaces(p.x, p.z, world, heightAt, () => 100);
  assert.ok(initial > 100);
  assert.equal(queries, initial);
  assert.equal(second.length, first.length);
  for (let i = 0; i < first.length; i++)
    for (let j = 0; j < 3; j++)
      assert.ok(Math.abs(second[i].points[j].y - first[i].points[j].y - 20) < 1e-9);
  forestCanopyFaces(p.x + 450, p.z, world, heightAt, () => 80);
  assert.ok(queries - initial < initial * 0.2);
  forestCanopyFaces(p.x, p.z, { ...world, revision: 43 }, heightAt, () => 80);
  assert.ok(queries > initial * 1.5);
});

test('unchanged flight configuration is not repeatedly deep-copied and recorded snapshots stay independent', () => {
  const s = createAircraft(aircraft.find((a) => a.id === 'f14')),
    m = new Mission(missions[0]),
    w = new Weapons(),
    aim = new Targeting(),
    rec = new FlightRecorder();
  let copies = 0;
  s.naval = {
    hook: false,
    nozzle: 0,
    toJSON() {
      copies++;
      return { hook: this.hook, nozzle: this.nozzle };
    },
  };
  s.airfield = {
    carrier: true,
    toJSON() {
      copies++;
      return { carrier: true };
    },
  };
  rec.start(s, m, [], w, aim);
  copies = 0;
  for (let i = 1; i <= 10; i++) {
    s.elapsed = i / 1200;
    rec.capture(s, m, [], w, aim, {});
  }
  assert.equal(copies, 0);
  s.naval.hook = true;
  s.gear = false;
  s.elapsed = 0.02;
  rec.capture(s, m, [], w, aim, {});
  const configs = rec.entries.filter((e) => e.kind === 'configuration');
  assert.equal(configs[0].data.naval.hook, false);
  assert.equal(configs.at(-1).data.naval.hook, true);
  assert.ok(copies > 0);
});

test('fading muzzle and explosion glow reuses one gradient definition without changing opacity or leaking alpha', () => {
  const keys = new Set(),
    draws = [];
  const ctx = {
    globalAlpha: 0.6,
    createRadialGradient() {
      return {
        stops: [],
        addColorStop(at, color) {
          this.stops.push([at, color]);
        },
      };
    },
    beginPath() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {
      keys.add(JSON.stringify(this.fillStyle.stops));
      draws.push(this.globalAlpha * rgba(this.fillStyle.stops[0][1])[3]);
    },
  };
  const r = { ctx, projectWorld: () => ({ x: 100, y: 100, depth: 100 }) };
  const state = { position: new Vec3(), orientation: new Quat() };
  for (let i = 1; i <= 200; i++) {
    const fade = i / 200;
    renderWeapons(r, state, {
      projectiles: [],
      effects: [{ kind: 'muzzle', life: fade, maxLife: 1 }],
    });
    assert.ok(Math.abs(draws.at(-1) - 0.6 * 0.5 * fade) < 1e-12);
    assert.equal(ctx.globalAlpha, 0.6);
  }
  assert.equal(keys.size, 1);
});
