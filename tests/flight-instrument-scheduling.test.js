import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightInstrumentLayer } from '../src/rendering/flightInstrumentLayer.js';
test('native cockpit creates no GPU/text canvas and only changes projection when the view changes', async () => {
  const previous = globalThis.document,
    root = { hidden: false, dataset: {}, style: {} };
  globalThis.document = {
    getElementById: () => root,
    fonts: { ready: Promise.resolve() },
    createElement() {
      throw new Error('Unexpected drawing canvas');
    },
  };
  try {
    const renderer = { w: 1280, h: 720, headLook: { yaw: 0, pitch: 0 } };
    const layer = new FlightInstrumentLayer(renderer);
    await layer.prepareAssets();
    layer.render();
    assert.equal(layer.active, false);
    assert.equal(layer.painter, undefined);
    const neutral = root.style.transform;
    renderer.headLook.yaw = 0.4;
    layer.render();
    assert.notEqual(root.style.transform, neutral);
    let writes = 0;
    Object.defineProperty(root.style, 'transform', {
      set() {
        writes++;
      },
    });
    layer.render();
    assert.equal(writes, 0);
    renderer.headLook.yaw = Math.PI;
    layer.render();
    assert.notEqual(root.style.visibility, 'hidden');
    assert.equal(writes, 1);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
