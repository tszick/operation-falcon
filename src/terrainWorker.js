import { prepareTerrain } from './terrainPreparation.js';
// Local module worker only: mission snapshots never leave the browser.
if (typeof DedicatedWorkerGlobalScope !== 'undefined' && self instanceof DedicatedWorkerGlobalScope)
  self.onmessage = ({ data: job }) => {
    try {
      const result = prepareTerrain(job);
      self.postMessage(result, [
        result.fills.buffer,
        result.lines.buffer,
        result.mask.buffer,
        result.gpuLines.buffer,
      ]);
    } catch (error) {
      self.postMessage({ error: String(error), key: job.key, revision: job.revision });
    }
  };
