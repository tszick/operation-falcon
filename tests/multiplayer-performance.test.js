import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerPerformance } from '../server/multiplayer-performance.mjs';
test('server timing separates physics, snapshots, event-loop delays and discarded simulation time', () => {
  const reports = [],
    m = new MultiplayerPerformance((r) => reports.push(r), { now: 0, intervalMs: 1000 });
  for (let i = 0; i < 120; i++) m.step(2);
  for (let i = 0; i < 20; i++) m.snapshot(1, 1000, 5);
  m.loop(500, 18, 5, 10);
  assert.equal(reports.length, 0);
  m.loop(1000, 38, 15, 20);
  const r = reports[0];
  assert.equal(r.simulationHz, 120);
  assert.equal(r.physicsMeanMs, 2);
  assert.equal(r.physicsP95Ms, 2);
  assert.equal(r.loopBusyPercent, 2);
  assert.equal(r.snapshotP95Ms, 1);
  assert.equal(r.discardedSimulationMs, 30);
  assert.equal(r.maxSchedulerDelayMs, 30);
  assert.equal(r.maxSnapshotBytes, 1000);
  assert.equal(r.downstreamKBps, 97.656);
  m.loop(2000, 8, 0, 0);
  assert.equal(reports[1].simulationHz, 0);
  assert.equal(reports[1].maxSnapshotBytes, 0);
});
test('server timing samples are bounded even if an interval is held open', () => {
  const m = new MultiplayerPerformance(() => {}, { now: 0, intervalMs: 1e9 });
  for (let i = 0; i < 10000; i++) {
    m.step(1);
    m.snapshot(1, 1, 1);
    m.loop(i, 8, 1, 0);
  }
  assert.equal(m.physics.length, 2048);
  assert.equal(m.loops.length, 2048);
  assert.equal(m.snapshots.length, 2048);
  assert.equal(m.steps, 10000);
});

test('GC pauses are separate bounded measurements and reset after each reporting window', () => {
  const out = [],
    m = new MultiplayerPerformance((r) => out.push(r), { now: 0, intervalMs: 1000 });
  m.recordGC(2);
  m.recordGC(11);
  m.loop(1000, 8, 1, 0, { rooms: 1, connections: 5 });
  assert.equal(out[0].gcCount, 2);
  assert.equal(out[0].maxGCPauseMs, 11);
  assert.equal(out[0].connections, 5);
  assert.ok(out[0].heapUsedMB > 0);
  m.loop(2000, 8, 1, 0);
  assert.equal(out[1].gcCount, 0);
  m.close();
});
