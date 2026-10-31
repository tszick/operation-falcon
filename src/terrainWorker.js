import { prepareTerrain } from './terrainPreparation.js';
// Local module worker only: mission snapshots never leave the browser.
globalThis.onmessage = ({ data: job }) => {
  try {
    const result = prepareTerrain(job);
    globalThis.postMessage(result, [
      result.fills.buffer,
      result.lines.buffer,
      result.mask.buffer,
      result.gpuLines.buffer,
    ]);
  } catch (error) {
    globalThis.postMessage({ error: String(error), key: job.key, revision: job.revision });
  }
};
