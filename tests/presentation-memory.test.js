import test from 'node:test';
import assert from 'node:assert/strict';
import { presentationMemory } from '../src/multiplayer/presentationMemory.js';
test('presentation accounting deduplicates shared GPU buffers and does not retain or alter resources', () => {
  const shared = { size: 1048576 },
    extra = { size: 524288 };
  const resources = new Set([{ buffers: [shared, extra] }]);
  const renderer = {
    gpuModels: { resources, uniformBuffer: shared, textures: new Map([['grass', {}]]) },
  };
  const instruments = {
    records: new Map([['engine', { buffer: extra }]]),
    painter: { buffer: shared },
  };
  const report = presentationMemory(renderer, instruments, {
    performance: { memory: { usedJSHeapSize: 2097152, totalJSHeapSize: 4194304 } },
    document: { getElementsByTagName: () => ({ length: 300 }) },
  });
  assert.equal(report.heapUsedMB, 2);
  assert.equal(report.heapTotalMB, 4);
  assert.equal(report.trackedBuffers, 2);
  assert.equal(report.trackedBufferMB, 1.5);
  assert.equal(report.domNodes, 300);
  assert.equal(report.instrumentPanels, 1);
  assert.equal(resources.size, 1);
  assert.equal(instruments.records.get('engine').buffer, extra);
  resources.clear();
  instruments.records.clear();
  renderer.gpuModels.uniformBuffer = null;
  instruments.painter.buffer = null;
  assert.equal(presentationMemory(renderer, instruments).trackedBuffers, 0);
});
test('unsupported browser heap reporting remains explicitly unavailable', () => {
  const report = presentationMemory(null, null, { performance: {}, document: {} });
  assert.equal(report.heapUsedMB, null);
  assert.equal(report.heapTotalMB, null);
  assert.equal(report.domNodes, null);
  assert.equal(report.trackedBufferMB, 0);
});
