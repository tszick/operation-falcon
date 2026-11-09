import { materialMipmaps } from './rendering/shared/materialMipmaps.js';
import { buildFarmland } from './farmland.js';
import { readTerrainJob } from './terrainSnapshot.js';
import { withTerrainSnapshot } from './terrain.js';
import { buildTerrainSurface } from './terrainSurface.js';
import { packedTerrainBuffers } from './rendering/shared/terrainData.js';
export function prepareTerrain(value) {
  const job = readTerrainJob(value);
  const start = performance.now();
  const data = withTerrainSnapshot(job.world, () => {
    const mesh = packedTerrainBuffers(
      buildTerrainSurface(job.cx, job.cz, undefined, { vehiclePatches: job.patches }),
      { wire: job.wire },
    );
    if (job.atlas) mesh.farmlandPixels = buildFarmland().pixels;
    mesh.materials = job.materials.map((kind) => ({ kind, levels: materialMipmaps(kind) }));
    return mesh;
  });
  return { ...data, key: job.key, revision: job.revision, buildMs: performance.now() - start };
}
