import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
// Exercise the real entrypoint guards without starting a browser or executing jobs.
for (const file of ['src/terrainWorker.js', 'src/rendering/featureVisibilityWorker.js']) {
  test(`${file} rejects window contexts and foreign-origin messages before reading their data`, async () => {
    const source = (await readFile(new URL('../' + file, import.meta.url), 'utf8'))
      .replace(/^import .*;\r?\n/gm, '')
      .replace(/export /g, '');
    class DedicatedWorkerGlobalScope {}
    const worker = new DedicatedWorkerGlobalScope();
    const context = { self: worker, DedicatedWorkerGlobalScope };
    runInNewContext(source, context);
    assert.equal(typeof worker.onmessage, 'function');
    for (const origin of ['https://other.example', 'null', 'https://same.example']) {
      const event = {
        origin,
        get data() {
          throw new Error('Foreign message data must not be read');
        },
      };
      assert.doesNotThrow(() => worker.onmessage(event));
    }
    const window = {};
    runInNewContext(source, { self: window, DedicatedWorkerGlobalScope });
    assert.equal(window.onmessage, undefined);
  });
}
