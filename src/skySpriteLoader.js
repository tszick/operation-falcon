// Raster generation runs in one shared worker, never inside the animation frame.
let worker;
const requests = new Map();
export function requestSkySprite(request) {
  const key = JSON.stringify(request);
  if (requests.has(key)) return requests.get(key).promise;
  if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined')
    return Promise.resolve(null);
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  requests.set(key, { promise, resolve });
  if (!worker) {
    try {
      worker = new Worker(new URL('./skySpriteWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = async ({ data }) => {
        const task = requests.get(data.key);
        if (!task) return;
        try {
          const image = await createImageBitmap(
            new ImageData(data.pixels, data.width, data.height),
          );
          task.resolve(image);
        } catch {
          task.resolve(null);
        }
      };
      worker.onerror = () => {
        for (const task of requests.values()) task.resolve(null);
        worker.terminate();
        worker = null;
      };
    } catch {
      resolve(null);
      return promise;
    }
  }
  worker.postMessage({ key, ...request });
  return promise;
}
