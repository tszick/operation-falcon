import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, Quat } from '../src/math.js';
import { cloudScreenAngle } from '../src/clouds.js';
import { requestSkySprite } from '../src/skySpriteLoader.js';

test('banked cloud bases follow the world horizon instead of rolling in the opposite direction', () => {
  for (const bank of [-1.1, -0.6, 0, 0.6, 1.1])
    for (const pitch of [-0.4, 0, 0.4]) {
      const q = Quat.euler(0.8, pitch, bank),
        r = { r: q.rotate(new Vec3(1, 0, 0)), u: q.rotate(new Vec3(0, 1, 0)) };
      const angle = cloudScreenAngle(r);
      assert.ok(Math.abs(angle + bank) < 1e-9);
      // For world-horizontal points, r.y*x - u.y*screenY is constant.
      const horizontalScreen = [r.u.y, r.r.y];
      assert.ok(
        Math.abs(Math.sin(angle) * horizontalScreen[0] - Math.cos(angle) * horizontalScreen[1]) <
          1e-9,
      );
    }
});

test('sky sprite requests share a module worker and cached promise, with bitmap creation after the pixel reply', async () => {
  const originals = {
    Worker: globalThis.Worker,
    ImageData: globalThis.ImageData,
    createImageBitmap: globalThis.createImageBitmap,
  };
  const workers = [],
    sent = [];
  let bitmapCalls = 0;
  globalThis.Worker = class {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      workers.push(this);
    }
    postMessage(data) {
      sent.push(data);
    }
    terminate() {
      this.terminated = true;
    }
  };
  globalThis.ImageData = class {
    constructor(pixels, width, height) {
      Object.assign(this, { pixels, width, height });
    }
  };
  globalThis.createImageBitmap = async (data) => {
    bitmapCalls++;
    return { width: data.width, height: data.height };
  };
  try {
    const request = { kind: 'cumulus', mode: 'worker-contract', variant: 0 };
    const first = requestSkySprite(request),
      again = requestSkySprite(request);
    assert.equal(first, again);
    assert.equal(sent.length, 1);
    assert.equal(workers.length, 1);
    assert.equal(bitmapCalls, 0);
    assert.equal(workers[0].options.type, 'module');
    assert.ok(workers[0].url.pathname.endsWith('/skySpriteWorker.js'));
    const pixels = new Uint8ClampedArray(16 * 8 * 4);
    await workers[0].onmessage({ data: { key: sent[0].key, pixels, width: 16, height: 8 } });
    assert.deepEqual(await first, { width: 16, height: 8 });
    assert.equal(bitmapCalls, 1);
    const pending = requestSkySprite({ kind: 'overcast', test: true });
    assert.equal(workers.length, 1);
    workers[0].onerror();
    assert.equal(await pending, null);
    assert.equal(workers[0].terminated, true);
  } finally {
    for (const [key, value] of Object.entries(originals))
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
  }
});
