const mib = (bytes) => Math.round(bytes / 10485.76) / 100;
// Read-only, low-frequency diagnostics. This is tracked buffer memory, not total VRAM.
export function presentationMemory(
  renderer,
  instruments,
  { performance = globalThis.performance, document = globalThis.document } = {},
) {
  const gpu = renderer?.gpuModels,
    buffers = new Set();
  const add = (buffer) => {
    if (Number.isFinite(buffer?.size)) buffers.add(buffer);
  };
  for (const key of [
    'uniformBuffer',
    'farmlandUniform',
    'terrainFill',
    'terrainLines',
    'featureBuffer',
    'featureMask',
  ])
    add(gpu?.[key]);
  add(gpu?.context?.buffer);
  add(instruments?.painter?.buffer);
  for (const resource of gpu?.resources || [])
    for (const buffer of resource.buffers || []) add(buffer);
  for (const records of [instruments?.records, instruments?.messageRecords])
    for (const record of records?.values() || []) add(record?.buffer);
  const heap = performance?.memory;
  return {
    heapUsedMB: Number.isFinite(heap?.usedJSHeapSize) ? mib(heap.usedJSHeapSize) : null,
    heapTotalMB: Number.isFinite(heap?.totalJSHeapSize) ? mib(heap.totalJSHeapSize) : null,
    domNodes: document?.getElementsByTagName?.('*').length ?? null,
    meshResources: gpu?.resources?.size ?? 0,
    textureCacheEntries: gpu?.textures?.size ?? 0,
    instrumentPanels: instruments?.records?.size ?? 0,
    trackedBuffers: buffers.size,
    trackedBufferMB: mib([...buffers].reduce((total, buffer) => total + buffer.size, 0)),
    scope:
      'Tracked GPU buffers only; JS heap is a Chromium estimate and can include shared-process pages.',
  };
}
