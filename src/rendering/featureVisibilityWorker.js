import { withTerrainSnapshot } from '../terrain.js';
import { terrainFeatureVisible } from '../terrainFeatures.js';
export function prepareFeatureVisibility(job) {
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
if (typeof document === 'undefined' && typeof postMessage === 'function')
  globalThis.onmessage = ({ data: job }) => {
    try {
      const result = prepareFeatureVisibility(job);
      globalThis.postMessage(result, [result.mask.buffer]);
    } catch (error) {
      globalThis.postMessage({ key: job.key, revision: job.revision, error: String(error) });
    }
  };
