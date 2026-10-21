import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, baseMarkerPosition } from '../src/renderer.js';
import { Vec3, Quat, DEG } from '../src/math.js';
function fixture() {
  const r = Object.create(Renderer.prototype),
    calls = { frames: [], arrows: 0, labels: [] };
  Object.assign(r, { w: 1200, h: 800, focal: 640 });
  r.setup(new Vec3(), new Quat());
  r.ctx = {
    strokeRect(...args) {
      calls.frames.push(args);
    },
    save() {},
    restore() {},
    translate() {
      calls.arrows++;
    },
    rotate() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    arc() {},
    fillText(t) {
      calls.labels.push(t);
    },
    measureText(t) {
      return { width: t.length * 6 };
    },
  };
  return { r, calls };
}
function atPixel(r, x, y) {
  return r.q
    .rotate(new Vec3(((x - r.w * 0.5) * 100) / r.focal, ((r.h * 0.53 - y) * 100) / r.focal, 100))
    .add(r.camera);
}
test('visible target frames remain frames in the old top, bottom and side exclusion bands', () => {
  const { r, calls } = fixture();
  for (const [x, y] of [
    [600, 20],
    [600, 80],
    [600, 129],
    [10, 400],
    [1190, 400],
    [600, 790],
    [0, 400],
    [1200, 400],
  ]) {
    const world = atPixel(r, x, y),
      screen = r.marker(world, 'TARGET');
    assert.ok(screen, `${x},${y}`);
    assert.ok(Math.abs(screen.x - x) < 1e-8);
    assert.ok(Math.abs(screen.y - y) < 1e-8);
  }
  assert.equal(calls.frames.length, 16);
  assert.equal(calls.arrows, 0);
});
test('banking the aircraft cannot convert a still-visible upper-screen target into an arrow', () => {
  const { r, calls } = fixture(),
    world = atPixel(r, 650, 80);
  for (const bank of [0, 20, 40, 60, -20, -40, -60, 0]) {
    r.setup(new Vec3(), Quat.euler(0, 0, bank * DEG));
    const screen = r.project(world);
    assert.ok(screen.x >= 0 && screen.x <= r.w && screen.y >= 0 && screen.y <= r.h);
    assert.deepEqual(r.marker(world, ''), screen);
  }
  assert.equal(calls.frames.length, 16);
  assert.equal(calls.arrows, 0);
});
test('only genuinely offscreen or behind-camera targets become arrows, and only BASE keeps an arrow label', () => {
  const { r, calls } = fixture();
  for (const point of [
    atPixel(r, -50, 400),
    atPixel(r, 1250, 400),
    atPixel(r, 600, -40),
    atPixel(r, 600, 850),
    new Vec3(0, 0, -100),
  ])
    assert.equal(r.marker(point, 'FALCON TWO'), null);
  assert.equal(calls.frames.length, 0);
  assert.equal(calls.arrows, 5);
  assert.equal(calls.labels.length, 0);
  r.marker(new Vec3(0, 0, -100), 'BASE 12 KM', undefined, false, { offscreenLabel: true });
  assert.deepEqual(calls.labels, ['BASE 12 KM']);
});

test('carrier base marker stays on its deck center under banking, rather than one kilometre astern', () => {
  const { r } = fixture(),
    home = { type: 'carrier', home: true, position: new Vec3(0, 0, 0) },
    marker = baseMarkerPosition([home], true),
    original = home.position.clone();
  assert.deepEqual(marker, new Vec3(0, 20, 0));
  for (const bank of [-60, 0, 60]) {
    r.setup(new Vec3(900, 500, -3000), Quat.euler(0, 0, bank * DEG));
    assert.deepEqual(r.project(marker), r.project(new Vec3(0, 20, 0)));
  }
  assert.deepEqual(home.position, original);
  home.position = new Vec3(200, 0, 800);
  assert.deepEqual(baseMarkerPosition([home], true), new Vec3(200, 20, 800));
  assert.deepEqual(baseMarkerPosition([], false), new Vec3(0, 10, -1000));
});
