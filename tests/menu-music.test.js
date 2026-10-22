import test from 'node:test';
import assert from 'node:assert/strict';
import { MenuMusic } from '../src/menuMusic.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
function locks() {
  let held = false;
  return {
    async request(name, options, callback) {
      if (held) return callback(null);
      held = true;
      try {
        return await callback({ name });
      } finally {
        held = false;
      }
    },
  };
}
function player(lockManager, render = () => Promise.resolve({ buffer: {} })) {
  const counts = { starts: 0, stops: 0, suspends: 0, contexts: 0 };
  const gain = {
    gain: { value: 0, setTargetAtTime() {}, setValueAtTime() {}, cancelScheduledValues() {} },
    connect() {},
  };
  const context = {
    sampleRate: 44100,
    currentTime: 0,
    state: 'running',
    createGain: () => gain,
    resume: () => Promise.resolve(),
    suspend: () => {
      counts.suspends++;
      return Promise.resolve();
    },
    createBufferSource: () => ({
      connect() {},
      disconnect() {},
      start() {
        counts.starts++;
      },
      stop() {
        counts.stops++;
      },
    }),
  };
  const instance = Object.assign(Object.create(MenuMusic.prototype), {
    epoch: 0,
    button: { dataset: {} },
    active: true,
    enabled: true,
    locks: lockManager,
    createContext: () => {
      counts.contexts++;
      return context;
    },
    renderMusic: render,
    refresh() {},
  });
  Object.defineProperty(instance, 'wanted', {
    get() {
      return this.active && this.enabled;
    },
  });
  return { instance, counts };
}
test('repeated clicks and key presses during asynchronous rendering create a single music source', async () => {
  let finish;
  const { instance, counts } = player(
    locks(),
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  for (let i = 0; i < 30; i++) instance.sync(true);
  await flush();
  finish({ buffer: {} });
  await flush();
  assert.equal(counts.contexts, 1);
  assert.equal(counts.starts, 1);
  instance.receiveEnabled(false);
  await flush();
  assert.equal(counts.stops, 1);
  assert.equal(instance.source, null);
});
test('turning music off before rendering finishes prevents a late invisible player', async () => {
  let finish;
  const { instance, counts } = player(
    locks(),
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  instance.sync(true);
  await flush();
  instance.receiveEnabled(false);
  finish({ buffer: {} });
  await flush();
  assert.equal(counts.starts, 0);
  assert.ok(counts.suspends > 0);
  assert.equal(instance.button.dataset.state, 'silent');
});
test('two game tabs share one playback lock and a global mute stops all sources', async () => {
  const manager = locks(),
    a = player(manager),
    b = player(manager);
  a.instance.sync(true);
  b.instance.sync(true);
  await flush();
  assert.equal(a.counts.starts + b.counts.starts, 1);
  assert.equal(b.instance.button.dataset.state, 'elsewhere');
  a.instance.receiveEnabled(false);
  b.instance.receiveEnabled(false);
  await flush();
  assert.equal(a.instance.source, null);
  assert.equal(b.instance.source, null);
  b.instance.receiveEnabled(true);
  await flush();
  assert.equal(b.counts.starts, 1);
  b.instance.receiveEnabled(false);
  await flush();
});
