import { TerrainBuildQueue } from '../terrainBuildQueue.js';
import { cachedFeatureVisible } from '../terrainFeatures.js';
import { terrainWorld } from '../terrain.js';
import { terrainSnapshot } from '../terrainSurface.js';
// Render-only sight rays may finish a few frames later. Radar and hit tests stay synchronous.
export class FeatureVisibility {
  constructor(
    workerFactory = () =>
      new Worker(new URL('./featureVisibilityWorker.js', import.meta.url), { type: 'module' }),
  ) {
    try {
      this.queue = new TerrainBuildQueue(workerFactory());
    } catch {
      this.queue = null;
    }
  }
  update(camera, patches, candidates, windowKey) {
    if (!this.queue || this.queue.failed)
      return Uint32Array.from(patches, (p, i) =>
        candidates[i] && cachedFeatureVisible(camera, p.center) ? 1 : 0,
      );
    if (this.revision !== terrainWorld.revision) {
      this.revision = terrainWorld.revision;
      this.known = new WeakMap();
    }
    if (this.windowKey !== windowKey) {
      this.windowKey = windowKey;
      this.mask = Uint32Array.from(patches, (p) => (p.center ? this.known.get(p.center) || 0 : 0));
    }
    const ready = this.queue.take(terrainWorld.revision);
    if (ready?.windowKey === windowKey) {
      for (let i = 0; i < patches.length; i++)
        if (ready.mask[i] < 2 && patches[i].center) {
          this.mask[i] = ready.mask[i];
          this.known.set(patches[i].center, ready.mask[i]);
        }
      this.workerMs = ready.buildMs;
    }
    const key = `${windowKey}:${Math.floor(camera.x / 8)}:${Math.floor(camera.y)}:${Math.floor(camera.z / 8)}:${candidates.join('')}`;
    if (this.requestKey !== key) {
      this.requestKey = key;
      this.queue.request({
        key,
        revision: terrainWorld.revision,
        windowKey,
        camera: { x: camera.x, y: camera.y, z: camera.z },
        points: patches.map((p, i) => (candidates[i] ? p.center : null)),
        world: terrainSnapshot(),
      });
    }
    return this.mask;
  }
  destroy() {
    this.queue?.fail();
  }
}
