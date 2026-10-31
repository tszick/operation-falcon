import { readVisibilityJob } from '../terrainSnapshot.js';
import { withTerrainSnapshot } from '../terrain.js';
import { terrainFeatureVisible } from '../terrainFeatures.js';
export function prepareFeatureVisibility(value) {
  const job = readVisibilityJob(value);
  const start = performance.now();
  const mask = withTerrainSnapshot(job.world, () =>
    Uint32Array.from(job.points, (p) => (p ? (terrainFeatureVisible(job.camera, p) ? 1 : 0) : 2)),
  );
  return {
    key: job.key,
    revision: job.revision,
    windowKey: job.windowKey,
    mask,
    buildMs: performance.now() - start,
  };
}
// The browser worker is local; no mission data is transmitted to external services.
if (typeof DedicatedWorkerGlobalScope !== 'undefined' && self instanceof DedicatedWorkerGlobalScope)
  self.onmessage = (event) => {
    // Dedicated Worker.postMessage events have an empty origin. Reject window-style
    // messages; the surrounding DedicatedWorkerGlobalScope guard also excludes Window.
    if (event.origin !== '') return;
    const job = event.data;
    try {
      const result = prepareFeatureVisibility(job);
      self.postMessage(result, [result.mask.buffer]);
    } catch (error) {
      self.postMessage({ key: job.key, revision: job.revision, error: String(error) });
    }
  };
