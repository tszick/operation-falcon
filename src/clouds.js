import { requestSkySprite } from './skySpriteLoader.js';
import { Vec3 } from './math.js';
import { seededRandom } from './oceanEnvironment.js';
const sprites = new Map(),
  layouts = new Map();
export function cloudLayout(seed = 1) {
  seed >>>= 0;
  if (layouts.has(seed)) return layouts.get(seed);
  const rng = seededRandom(seed),
    clouds = Array.from({ length: 30 }, (_, i) => ({
      bearing: ((i + rng() * 0.65) * Math.PI * 2) / 30,
      elevation: 0.14 + rng() * 0.52,
      size: 0.14 + rng() * 0.19,
      variant: i % 4,
    }));
  if (layouts.size > 16) layouts.clear();
  layouts.set(seed, clouds);
  return clouds;
}
export function cloudPalette(mode) {
  return mode === 'night'
    ? { top: '#9cabbf', shade: '#46546d', opacity: 0.48 }
    : mode === 'vector'
      ? { top: '#aac6b4', shade: '#526d66', opacity: 0.4 }
      : mode === 'sunset'
        ? { top: '#f4ceae', shade: '#a17d8b', opacity: 0.82 }
        : mode === 'winter'
          ? { top: '#edf0ee', shade: '#8d9ba6', opacity: 0.76 }
          : mode === 'desert'
            ? { top: '#fff0d9', shade: '#a8aaa3', opacity: 0.86 }
            : { top: '#f7f8ef', shade: '#8cabbc', opacity: 0.9 };
}
export function cloudPixels(mode, variant, width = 256, height = 128) {
  const palette = cloudPalette(mode),
    rng = seededRandom(321 + variant * 47),
    color = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)),
    top = color(palette.top),
    shade = color(palette.shade),
    puffs = Array.from({ length: 7 }, (_, i) => ({
      x: 38 + i * 29,
      y: 77 - Math.sin((i * Math.PI) / 6) * (20 + rng() * 18),
      rx: 31 + rng() * 10,
      ry: 23 + rng() * 10,
    }));
  puffs.push({ x: 128, y: 82, rx: 98, ry: 18 });
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const px = (x * 256) / width,
        py = (y * 128) / height;
      let field = -1;
      for (const puff of puffs)
        field = Math.max(
          field,
          1 - ((px - puff.x) / puff.rx) ** 2 - ((py - puff.y) / puff.ry) ** 2,
        );
      if (field <= 0) continue;
      const edge = Math.min(1, field / 0.2),
        alpha = edge * edge * (3 - 2 * edge),
        shadow = Math.max(0, Math.min(0.55, (py - 56) / 100));
      const i = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++)
        pixels[i + channel] = top[channel] * (1 - shadow) + shade[channel] * shadow;
      pixels[i + 3] = Math.round(alpha * 255);
    }
  return pixels;
}
const requestedModes = new Set();
function cloudSprite(mode, variant) {
  if (!requestedModes.has(mode)) {
    requestedModes.add(mode);
    // Prepare all variants together off the main thread before a turn reveals them.
    for (let v = 0; v < 4; v++) {
      const key = mode + ':' + v;
      sprites.set(key, null);
      requestSkySprite({ kind: 'cumulus', mode, variant: v }).then((image) =>
        sprites.set(key, image),
      );
    }
  }
  return sprites.get(mode + ':' + variant);
}
// A world-horizontal cloud base must tilt with the horizon, not against it.
export function cloudScreenAngle(r) {
  return Math.atan2(r.r.y, r.u.y);
}
export function renderCumulus(r, world) {
  const c = r.ctx,
    mode = r.surfaceMode || 'vector',
    palette = cloudPalette(mode),
    seed = world.skySeed ?? Math.round((world.revision || 1) * 22695477);
  for (const cloud of cloudLayout(seed)) {
    const cos = Math.cos(cloud.elevation),
      direction = new Vec3(
        Math.sin(cloud.bearing) * cos,
        Math.sin(cloud.elevation),
        Math.cos(cloud.bearing) * cos,
      ),
      point = r.project(r.camera.clone().add(direction.scale(100000)));
    if (
      !point ||
      point.x < -r.w * 0.5 ||
      point.x > r.w * 1.5 ||
      point.y < -r.h * 0.5 ||
      point.y > r.h * 1.5
    )
      continue;
    const image = cloudSprite(mode, cloud.variant);
    if (!image) continue;
    const size = r.focal * cloud.size;
    c.save();
    c.globalAlpha = palette.opacity;
    c.translate(point.x, point.y);
    c.rotate(cloudScreenAngle(r));
    c.drawImage(image, -size * 0.5, -size * 0.25, size, size * 0.5);
    c.restore();
  }
}
