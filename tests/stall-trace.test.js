import test from 'node:test';
import assert from 'node:assert/strict';
import { StallTrace } from '../src/multiplayer/stallTrace.js';

test('browser task diagnostics tolerate missing or partially implemented observers', () => {
  const missing = new StallTrace(null);
  assert.deepEqual(missing.recent(100).supported, []);
  class Partial {
    static supportedEntryTypes = ['longtask'];
    observe() {
      throw new Error('unavailable');
    }
  }
  assert.deepEqual(new StallTrace(Partial).supported, []);
  missing.disconnect();
});

test('delayed browser observers preserve task timestamps, bound retained data and release subscriptions', () => {
  const observers = [];
  class Observer {
    static supportedEntryTypes = ['long-animation-frame', 'longtask'];
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(options) {
      this.type = options.type;
    }
    takeRecords() {
      this.drained = true;
    }
    disconnect() {
      this.stopped = true;
    }
  }
  const trace = new StallTrace(Observer);
  assert.equal(observers.length, 2);
  const entry = {
    entryType: 'long-animation-frame',
    startTime: 100,
    duration: 75,
    blockingDuration: 30,
    renderStart: 160,
    styleAndLayoutStart: 162,
    scripts: [
      {
        duration: 15,
        sourceFunctionName: 'frame',
        sourceURL: 'http://localhost:5174/src/multiplayer/page.js?private=value',
        invoker: 'FrameRequestCallback',
        forcedStyleAndLayoutDuration: 4,
      },
    ],
  };
  observers[0].callback({ getEntries: () => [entry] });
  entry.scripts[0].duration = 900;
  assert.equal(trace.recent(200, 50).tasks[0].scripts[0].duration, 15);
  assert.equal(trace.recent(200, 50).tasks[0].scripts[0].source, 'page.js');
  assert.equal(trace.recent(300, 50).tasks.length, 0);
  for (let i = 0; i < 50; i++) trace.record({ ...entry, startTime: 500 + i, scripts: [] });
  assert.equal(trace.entries.length, 32);
  assert.equal(trace.recent(600).tasks.length, 8);
  trace.reset();
  assert.deepEqual(trace.entries, []);
  assert.ok(observers.every((o) => o.drained));
  trace.disconnect();
  assert.ok(observers.every((o) => o.stopped));
});

test('network timing summaries distinguish a burst from an isolated costly packet and remain bounded', () => {
  const trace = new StallTrace(null);
  trace.recordNetwork('decode', 100, 1);
  trace.recordNetwork('apply', 101, 5);
  trace.recordNetwork('decode', 1000, 90);
  const report = trace.recent(200, 100);
  assert.equal(report.network.samples, 2);
  assert.equal(report.network.totalMs, 6);
  assert.equal(report.network.maxMs, 5);
  assert.equal(report.network.slowest[0].kind, 'apply');
  for (let i = 0; i < 400; i++) trace.recordNetwork('decode', 2000 + i, 1);
  assert.equal(trace.network.length, 256);
  trace.reset();
  assert.equal(trace.network.length, 0);
});
