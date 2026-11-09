import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameClock } from '../src/frameClock.js';
import { GpuQueueProbe } from '../src/rendering/webgpu/queueProbe.js';
import { Surface } from '../src/rendering/webgpu/device.js';
import { FrameTelemetry } from '../src/frameTelemetry.js';

test('frame clocks distinguish previous callback work, callback delay and long gaps between callbacks', () => {
  const clock = new FrameClock();
  assert.deepEqual(clock.begin(100, 102), {
    callbackDelayMs: 2,
    betweenFramesMs: 0,
    previousCpuMs: 0,
  });
  clock.end(110);
  assert.deepEqual(clock.begin(500, 503), {
    callbackDelayMs: 3,
    betweenFramesMs: 393,
    previousCpuMs: 8,
  });
  clock.end(510);
  clock.reset();
  assert.deepEqual(clock.begin(700, 701), {
    callbackDelayMs: 1,
    betweenFramesMs: 0,
    previousCpuMs: 0,
  });
});

test('telemetry reports long gaps without silently excluding them from FPS or hiding heavy callback work', () => {
  const telemetry = new FrameTelemetry();
  telemetry.add({
    frameMs: 400,
    cpuMs: 5,
    previousCpuMs: 4,
    betweenFramesMs: 395,
    callbackDelayMs: 2,
  });
  telemetry.add({ frameMs: 100, cpuMs: 90, betweenFramesMs: 8, callbackDelayMs: 1 });
  const report = telemetry.flush();
  assert.equal(report.maxFrameMs, 400);
  assert.equal(report.maxCpuMs, 90);
  assert.equal(report.maxBetweenFramesMs, 395);
  assert.equal(report.maxCallbackDelayMs, 2);
  assert.equal(report.fps, 4);
  assert.equal(report.longFrames, 2);
});

test('GPU queue probes allow one pending fence, obey their interval and never block rendering', async () => {
  let clock = 0,
    calls = 0,
    resolve;
  const queue = {
    onSubmittedWorkDone() {
      calls++;
      return new Promise((r) => {
        resolve = r;
      });
    },
  };
  const probe = new GpuQueueProbe({ now: () => clock });
  const stats = probe.stats;
  probe.request(queue);
  probe.request(queue);
  assert.equal(calls, 1);
  assert.equal(stats.pending, true);
  clock = 120;
  resolve();
  await Promise.resolve();
  assert.equal(stats.lastMs, 120);
  assert.equal(stats.samples, 1);
  assert.equal(stats.pending, false);
  clock = 999;
  probe.request(queue);
  assert.equal(calls, 1);
  clock = 1000;
  probe.request(queue);
  assert.equal(calls, 2);
  clock = 1005;
  resolve();
  await Promise.resolve();
  assert.equal(stats.lastMs, 5);
  assert.equal(stats.maxMs, 120);
  assert.equal(probe.stats, stats);
});

test('unavailable, failed and lost GPU queue fences cannot throw into the game or create unhandled rejection', async () => {
  const probe = new GpuQueueProbe({ now: () => 0, intervalMs: 0 });
  probe.request({});
  assert.equal(probe.stats.pending, false);
  probe.request({
    onSubmittedWorkDone() {
      throw new Error('device lost');
    },
  });
  assert.equal(probe.stats.failures, 1);
  probe.request({
    onSubmittedWorkDone() {
      return Promise.reject(new Error('lost'));
    },
  });
  await Promise.resolve();
  assert.equal(probe.stats.failures, 2);
  assert.equal(probe.stats.pending, false);
});

test('surface microtasks stay coalesced and record flush and presentation costs outside the rAF callback', (t) => {
  let clock = 0;
  const tasks = [];
  t.mock.method(performance, 'now', () => clock);
  t.mock.method(globalThis, 'queueMicrotask', (fn) => tasks.push(fn));
  const surface = Object.assign(Object.create(Surface.prototype), {
    profile: true,
    painter: {
      flush() {
        clock += 4;
      },
    },
    present() {
      clock += 3;
    },
  });
  surface.schedule();
  surface.schedule();
  assert.equal(tasks.length, 1);
  tasks.shift()();
  assert.equal(surface.scheduled, false);
  assert.deepEqual(surface.profileMetrics, { tasks: 1, flushPeakMs: 4, presentPeakMs: 3 });
  surface.schedule();
  tasks.shift()();
  assert.equal(surface.profileMetrics.tasks, 2);
});
