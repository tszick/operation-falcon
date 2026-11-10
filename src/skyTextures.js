// Static assets are decoded once and retained; no raster generation in a frame.
const images = new Map();
export function skyTexture(kind) {
  if (typeof Image === 'undefined') return null;
  let image = images.get(kind);
  if (!image) {
    image = new Image();
    image.src =
      kind === 'night'
        ? '/assets/environment/night-milky-way-v1.png'
        : '/assets/environment/cloud-cumulus-v1.png';
    images.set(kind, image);
  }
  return image.complete && image.naturalWidth ? image : null;
}
