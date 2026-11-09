import { prepareTerrain } from './terrainPreparation.js';
// Local module worker only: mission snapshots never leave the browser.
if (typeof DedicatedWorkerGlobalScope !== 'undefined' && self instanceof DedicatedWorkerGlobalScope)
  self.onmessage = (event) => {
    // Dedicated Worker.postMessage events have an empty origin. Reject window-style
    // messages; the surrounding DedicatedWorkerGlobalScope guard also excludes Window.
    if (event.origin !== '') return;
    const job = event.data;
    try {
      const result = prepareTerrain(job);
      const transfers = [result.fills.buffer, result.lines.buffer, result.gpuLines.buffer];
      if (result.farmlandPixels) transfers.push(result.farmlandPixels.buffer);
      for (const material of result.materials)
        for (const level of material.levels) transfers.push(level.pixels.buffer);
      self.postMessage(result, transfers);
    } catch (error) {
      self.postMessage({ error: String(error), key: job.key, revision: job.revision });
    }
  };
