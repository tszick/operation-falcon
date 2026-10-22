import { cloudPixels } from './clouds.js';
import { overcastPixels } from './environmentSky.js';
self.onmessage = ({ data }) => {
  const overcast = data.kind === 'overcast',
    width = overcast ? 512 : 256,
    height = overcast ? 256 : 128;
  const pixels = overcast
    ? overcastPixels(width, height)
    : cloudPixels(data.mode, data.variant, width, height);
  self.postMessage({ key: data.key, pixels, width, height }, [pixels.buffer]);
};
