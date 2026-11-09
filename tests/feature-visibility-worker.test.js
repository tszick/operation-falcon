import { updateFeatureVisibility } from '../src/rendering/shared/featureData.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FeatureVisibility } from '../src/rendering/featureVisibility.js';
import { prepareFeatureVisibility } from '../src/rendering/featureVisibilityWorker.js';
import { terrainFeatureVisible } from '../src/terrainFeatures.js';
import { configureTerrain, terrainWorld } from '../src/terrain.js';
import { terrainSnapshot } from '../src/terrainSurface.js';
import { Vec3 } from '../src/math.js';
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
function setup() {
  configureTerrain({ id: 'bridge' }, new Vec3(22000, 0, 0), () => 0.3);
  const w = fakeWorker(),
    visibility = new FeatureVisibility(() => w),
    camera = new Vec3(0, 2500, 0),
    patches = [{ center: new Vec3(1000, 2500, 1000) }];
  return { w, visibility, camera, patches };
}
test('background feature sight rays preserve exact terrain visibility and the live world', () => {
  const { camera } = setup(),
    live = terrainWorld;
  const points = [new Vec3(1000, 2500, 1000), new Vec3(22000, 0, 0), null];
  const result = prepareFeatureVisibility({
    key: 'ray',
    revision: live.revision,
    windowKey: 'window',
    camera,
    points,
    world: terrainSnapshot(),
  });
  assert.deepEqual(
    [...result.mask],
    points.map((p) => (p ? (terrainFeatureVisible(camera, p) ? 1 : 0) : 2)),
  );
  assert.equal(result.mask[0], 1);
  assert.equal(terrainWorld, live);
});
test('visibility requests coalesce rapid flight and never expose untested geometry', () => {
  const { w, visibility: v, camera, patches } = setup();
  assert.deepEqual([...v.update(camera, patches, [1], 'a')], [0]);
  for (let i = 1; i <= 10; i++) v.update(new Vec3(i * 100, 2500, 0), patches, [1], 'a');
  assert.equal(w.sent.length, 1);
  w.onmessage({ data: prepareFeatureVisibility(w.sent[0]) });
  assert.equal(w.sent.length, 2);
  assert.equal(w.sent[1].camera.x, 1000);
  w.onmessage({ data: prepareFeatureVisibility(w.sent[1]) });
  assert.deepEqual([...v.update(new Vec3(1000, 2500, 0), patches, [1], 'a')], [1]);
  const count = w.sent.length;
  v.update(new Vec3(1000, 2500, 0), patches, [1], 'a');
  assert.equal(w.sent.length, count);
});
test('moving ribbon windows keep known overlap and untested offscreen rays do not erase it', () => {
  const { w, visibility: v, camera, patches } = setup();
  v.update(camera, patches, [1], 'a');
  w.onmessage({ data: prepareFeatureVisibility(w.sent[0]) });
  assert.deepEqual([...v.update(camera, patches, [1], 'a')], [1]);
  assert.deepEqual([...v.update(camera, patches, [1], 'b')], [1]);
  w.onmessage({ data: prepareFeatureVisibility(w.sent.at(-1)) });
  v.update(camera, patches, [0], 'b');
  w.onmessage({ data: prepareFeatureVisibility(w.sent.at(-1)) });
  assert.deepEqual([...v.update(camera, patches, [1], 'b')], [1]);
});
test('another mission cannot reuse old visibility and worker failure keeps the synchronous fallback', () => {
  const { w, visibility: v, camera, patches } = setup();
  v.update(camera, patches, [1], 'old');
  configureTerrain({ id: 'bridge' }, new Vec3(22000, 0, 0), () => 0.7);
  assert.deepEqual([...v.update(camera, patches, [1], 'new')], [0]);
  w.onmessage({ data: prepareFeatureVisibility(w.sent[0]) });
  assert.deepEqual([...v.update(camera, patches, [1], 'new')], [0]);
  w.onerror();
  assert.deepEqual([...v.update(camera, patches, [1], 'new')], [1]);
  assert.ok(w.stopped);
  const unavailable = new FeatureVisibility(() => {
    throw new Error('unavailable');
  });
  assert.deepEqual([...unavailable.update(camera, patches, [1], 'fallback')], [1]);
});
test('flight telemetry distinguishes feature rays, HUD layout, instrument painting and audio spikes', () => {
  const t = new FrameTelemetry();
  t.add({ frameMs: 70, featureMs: 30, hudMs: 25, instrumentMs: 8, audioMs: 3 });
  const report = t.flush();
  assert.equal(report.maxFeatureMs, 30);
  assert.equal(report.maxHudMs, 25);
  assert.equal(report.maxInstrumentMs, 8);
  assert.equal(report.maxAudioMs, 3);
});

test('candidate changes use short exact request keys without retaining mutable input arrays', () => {
  const { w, visibility: v, camera } = setup();
  const patches = Array.from({ length: 8000 }, (_, i) => ({ center: new Vec3(i, 2500, 1000) }));
  const candidates = new Uint8Array(patches.length).fill(1);
  v.update(camera, patches, candidates, 'large-window');
  const first = w.sent[0];
  assert.ok(first.key.length < 100);
  w.onmessage({
    data: {
      key: first.key,
      revision: first.revision,
      windowKey: 'large-window',
      mask: new Uint32Array(8000),
    },
  });
  v.update(camera, patches, new Uint8Array(candidates), 'large-window');
  assert.equal(w.sent.length, 1);
  candidates[4321] = 0;
  v.update(camera, patches, candidates, 'large-window');
  assert.equal(w.sent.length, 2);
  assert.notEqual(w.sent[1].key, first.key);
  assert.equal(w.sent[1].points[4321], null);
  candidates[4321] = 1;
  assert.equal(w.sent[1].points[4321], null);
  v.update(camera, patches, candidates, 'large-window');
  w.onmessage({
    data: {
      key: w.sent[1].key,
      revision: first.revision,
      windowKey: 'large-window',
      mask: new Uint32Array(8000),
    },
  });
  assert.equal(w.sent.length, 3);
  assert.notEqual(w.sent[2].key, w.sent[1].key);
  assert.equal(w.sent[2].points[4321], patches[4321].center);
});

test('unchanged feature masks skip uploads while newly visible and hidden patches both update', () => {
  const values = new Uint32Array(4);
  assert.equal(updateFeatureVisibility(values, [1, 1, 0, 1], [0, 0, 1, 0]), false);
  assert.equal(updateFeatureVisibility(values, [1, 1, 0, 1], [1, 0, 1, 1]), true);
  assert.deepEqual([...values], [1, 0, 0, 1]);
  assert.equal(updateFeatureVisibility(values, [1, 1, 0, 1], [1, 0, 1, 1]), false);
  assert.equal(updateFeatureVisibility(values, [0, 1, 1, 1], [1, 0, 1, 1]), true);
  assert.deepEqual([...values], [0, 0, 1, 1]);
  assert.equal(updateFeatureVisibility(values, [0, 1, 1, 1], [1, 0, 1, 1]), false);
});
