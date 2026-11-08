import { materialPixels } from './materialPixels.js';
export const preparedMaterialKinds = Object.freeze([
  'concrete',
  'hangar',
  'aircraft',
  'camo',
  'asphalt',
  'terrain',
  'terrain-sand',
  'terrain-rock',
  'terrain-sea',
  'terrain-snow',
]);
// Byte-identical box filtering, prepared off-thread for the live flight view.
export function materialMipmaps(kind, size = kind === 'hangar' ? 512 : 256) {
  const levels = [];
  let pixels = materialPixels(kind, size),
    width = size;
  while (true) {
    levels.push({ width, pixels });
    if (width === 1) return levels;
    const n = width / 2,
      next = new Uint8Array(width * width);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        for (let c = 0; c < 4; c++)
          next[(y * n + x) * 4 + c] =
            (pixels[(y * 2 * width + x * 2) * 4 + c] +
              pixels[(y * 2 * width + x * 2 + 1) * 4 + c] +
              pixels[((y * 2 + 1) * width + x * 2) * 4 + c] +
              pixels[((y * 2 + 1) * width + x * 2 + 1) * 4 + c]) /
            4;
    pixels = next;
    width = n;
  }
}
