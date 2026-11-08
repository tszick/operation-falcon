import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightInstrumentLayer } from '../src/rendering/flightInstrumentLayer.js';

test('the first cockpit paint yields between expensive panels and retains completed geometry', (t) => {
  let clock = 0;
  t.mock.method(performance, 'now', () => clock);
  const regions = ['weapons', 'radar', 'mission'].map((id) => ({ id })),
    painted = [],
    submitted = [];
  const ctx = { drawImage() {}, save() {}, resetTransform() {}, restore() {} };
  const layer = Object.assign(Object.create(FlightInstrumentLayer.prototype), {
    active: true,
    root: { children: regions, querySelectorAll: () => [] },
    renderer: { w: 100, h: 100, canvas: { width: 100, height: 100 }, ctx },
    canvas: { width: 0, height: 0 },
    records: new Map(),
    messageRecords: new Map(),
    dirty: new Set(),
    svgRecords: { clear() {} },
    canvasRevisions: new WeakMap(),
    canvasTextures: new WeakMap(),
    painter: {
      atlas: {},
      capture(draw) {
        draw();
        return { vertices: [clock], batches: [] };
      },
      clearRect() {},
      renderRecords(records) {
        submitted.push([...records]);
      },
    },
    paint(context, region) {
      painted.push(region.id);
      clock += 4;
    },
  });
  layer.render();
  assert.deepEqual(painted, ['weapons']);
  assert.equal(layer.metrics.pending, 2);
  assert.equal(layer.metrics.painted, 1);
  const first = layer.records.get(regions[0]);
  assert.equal(submitted[0][0], first);
  assert.equal(submitted[0][1], null);
  layer.render();
  assert.deepEqual(painted, ['weapons', 'radar']);
  assert.equal(layer.metrics.pending, 1);
  layer.render();
  assert.deepEqual(painted, ['weapons', 'radar', 'mission']);
  assert.equal(layer.metrics.pending, 0);
  assert.equal(layer.records.get(regions[0]), first);
  layer.render();
  assert.equal(layer.metrics.painted, 0);
  assert.equal(submitted.length, 3);
});

test('cockpit assets decode and upload before preparation resolves without reading hidden geometry', async (t) => {
  const oldDocument = globalThis.document,
    oldImage = globalThis.Image,
    oldStyle = globalThis.getComputedStyle;
  const events = [];
  let release;
  const decoded = new Promise((resolve) => {
    release = resolve;
  });
  globalThis.document = { fonts: { ready: Promise.resolve() } };
  globalThis.Image = class {
    set src(value) {
      this.url = value;
      events.push('load');
    }
    decode() {
      events.push('decode');
      return decoded.then(() => {
        this.naturalWidth = 100;
      });
    }
  };
  const imageElement = {};
  globalThis.getComputedStyle = (element) => ({
    backgroundImage: element === imageElement ? 'url("/assets/cockpit/prepare-test.png")' : 'none',
  });
  t.after(() => {
    for (const [key, value] of [
      ['document', oldDocument],
      ['Image', oldImage],
      ['getComputedStyle', oldStyle],
    ]) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  const root = { hidden: true, querySelectorAll: () => [imageElement] };
  Object.defineProperty(root, 'offsetWidth', {
    get() {
      throw new Error('hidden layout measured');
    },
  });
  const layer = Object.assign(Object.create(FlightInstrumentLayer.prototype), {
    active: true,
    root,
    painter: {
      surface: { ready: Promise.resolve() },
      atlasReady: Promise.resolve(),
      externalTexture(image) {
        assert.equal(image.naturalWidth, 100);
        events.push('upload');
      },
    },
  });
  let ready = false;
  const preparing = layer.prepareAssets().then(() => {
    ready = true;
  });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.deepEqual(events, ['load', 'decode']);
  assert.equal(ready, false);
  release();
  await preparing;
  assert.deepEqual(events, ['load', 'decode', 'upload']);
  assert.equal(root.hidden, true);
});

test('cockpit preparation tolerates failed decorative assets and is a no-op for non-WebGPU rendering', async (t) => {
  const oldDocument = globalThis.document,
    oldImage = globalThis.Image,
    oldStyle = globalThis.getComputedStyle;
  globalThis.document = {};
  globalThis.Image = class {
    decode() {
      return Promise.reject(new Error('missing image'));
    }
  };
  globalThis.getComputedStyle = () => ({
    backgroundImage: 'url("/assets/cockpit/missing-test.png")',
  });
  t.after(() => {
    for (const [key, value] of [
      ['document', oldDocument],
      ['Image', oldImage],
      ['getComputedStyle', oldStyle],
    ]) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  const layer = Object.assign(Object.create(FlightInstrumentLayer.prototype), {
    active: true,
    root: { querySelectorAll: () => [] },
    painter: {
      surface: { ready: Promise.resolve() },
      externalTexture() {
        throw new Error('failed image uploaded');
      },
    },
  });
  await layer.prepareAssets();
  await Object.assign(Object.create(FlightInstrumentLayer.prototype), {
    active: false,
  }).prepareAssets();
});
