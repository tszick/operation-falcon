import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameTelemetry } from '../src/frameTelemetry.js';
test('timing reports distinguish wall-frame stalls from simulation, drawing and UI work', () => {
  const t = new FrameTelemetry(100);
  assert.equal(t.add({ frameMs: 20, cpuMs: 5, renderMs: 3, simulationMs: 1, uiMs: 1 }), null);
  const r = t.add({ frameMs: 80, cpuMs: 15, renderMs: 10, simulationMs: 3, uiMs: 2 });
  assert.equal(r.frames, 2);
  assert.equal(r.fps, 20);
  assert.equal(r.maxFrameMs, 80);
  assert.equal(r.p95FrameMs, 80);
  assert.equal(r.longFrames, 1);
  assert.equal(r.cpuMs, 10);
  assert.equal(r.renderMs, 6.5);
  assert.equal(r.simulationMs, 2);
  assert.equal(r.uiMs, 1.5);
  assert.equal(t.flush(), null);
});
test('pausing can flush a partial window and a new mission clears old performance samples', () => {
  const t = new FrameTelemetry();
  t.add({ frameMs: 25 });
  assert.equal(t.flush().fps, 40);
  t.add({ frameMs: 100 });
  t.reset();
  assert.equal(t.flush(), null);
  assert.equal(t.add({ frameMs: NaN }), null);
  assert.equal(t.add({ frameMs: 0 }), null);
  assert.equal(t.flush(), null);
});
