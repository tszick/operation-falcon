import { withTerrainSnapshot } from './terrain.js';
import { buildTerrainSurface } from './terrainSurface.js';
import { packedTerrainBuffers } from './rendering/shared/terrainData.js';
export function prepareTerrain(job) {
  const start = performance.now();
  const data = withTerrainSnapshot(job.world, () =>
    packedTerrainBuffers(
      buildTerrainSurface(job.cx, job.cz, undefined, { vehiclePatches: job.patches }),
      { wire: job.wire },
    ),
  );
  return { ...data, key: job.key, revision: job.revision, buildMs: performance.now() - start };
}
