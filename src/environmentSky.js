import { requestSkySprite } from './skySpriteLoader.js';
import { renderCumulus, cloudScreenAngle } from './clouds.js';
import { terrainWorld } from './terrain.js';
import { surfaceStyle } from './surfaceStyle.js';
import { Vec3 } from './math.js';
let cloudSprite,
  cloudPending = false;
// The weather sheet must fade to transparent before every texture boundary.
// Radial lobes clipped by the old canvas produced visible rectangular seams.
export function overcastPixels(width = 512, height = 256) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const smooth = (x) => {
    x = Math.max(0, Math.min(1, x));
    return x * x * (3 - 2 * x);
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const px = x / (width - 1),
        py = y / (height - 1);
      const fade = smooth(Math.min(px, 1 - px) / 0.18) * smooth(Math.min(py, 1 - py) / 0.24);
      let alpha = 0,
        tone = 0;
      for (let i = 0; i < 22; i++) {
        const cx = (32 + ((i * 79) % 448)) / 512,
          cy = (55 + ((i * 43) % 145)) / 256,
          radius = (55 + (i % 4) * 12) / 512,
          distance = Math.hypot(px - cx, (py - cy) * 0.5) / radius,
          weight = smooth(1 - distance) * (i % 2 ? 0.12 : 0.09);
        tone += (i % 2 ? 225 : 65) * weight;
        alpha += weight;
      }
      const p = (y * width + x) * 4;
      const gray = alpha > 0 ? tone / alpha : 128;
      pixels[p] = gray;
      pixels[p + 1] = gray + 5;
      pixels[p + 2] = gray + 11;
      pixels[p + 3] = Math.round((1 - Math.exp(-alpha)) * fade * 255);
    }
  return pixels;
}
function overcastSprite() {
  if (cloudSprite) return cloudSprite;
  if (!cloudPending) {
    cloudPending = true;
    requestSkySprite({ kind: 'overcast' }).then((image) => {
      cloudSprite = image;
    });
  }
  return null;
}
export function renderEnvironmentSky(r) {
  const c = r.ctx,
    { w, h } = r,
    p = surfaceStyle(r.surfaceMode),
    vector = r.surfaceMode === 'vector';
  const tilt = Math.hypot(r.r.y, r.u.y),
    dx = r.r.y / Math.max(0.001, tilt),
    dy = -r.u.y / Math.max(0.001, tilt),
    span = Math.hypot(w, h) * 0.6,
    gx = w * 0.5 - (r.f.y * r.r.y * r.focal) / Math.max(0.01, tilt * tilt),
    gy = h * 0.53 + (r.f.y * r.u.y * r.focal) / Math.max(0.01, tilt * tilt);
  const sky = vector
    ? c.createLinearGradient(0, 0, 0, h)
    : c.createLinearGradient(gx + dx * span, gy + dy * span, gx - dx * span, gy - dy * span);
  sky.addColorStop(0, p.sky[0]);
  sky.addColorStop(vector ? 0.48 : 0.55, p.sky[1]);
  sky.addColorStop(1, p.sky[2]);
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  if (p.sun) {
    const bearing = 0.7,
      elevation = 0.045,
      point = r.project(
        r.camera
          .clone()
          .add(
            new Vec3(
              Math.sin(bearing) * Math.cos(elevation),
              Math.sin(elevation),
              Math.cos(bearing) * Math.cos(elevation),
            ).scale(100000),
          ),
      );
    if (point) {
      const radius = h * 0.18,
        glow = c.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
      glow.addColorStop(0, '#ffe3a19c');
      glow.addColorStop(0.12, '#ffc17c45');
      glow.addColorStop(1, '#ffb37800');
      c.fillStyle = glow;
      c.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
      c.fillStyle = '#ffe0a7';
      c.beginPath();
      c.arc(point.x, point.y, Math.max(3, h * 0.011), 0, Math.PI * 2);
      c.fill();
    }
  }
  if (p.clouds && r.cloudsEnabled !== false) {
    const image = overcastSprite();
    if (image)
      for (let i = 0; i < 16; i++) {
        const bearing = (i * Math.PI) / 8,
          elevation = 0.23 + (i % 3) * 0.18,
          dir = new Vec3(
            Math.sin(bearing) * Math.cos(elevation),
            Math.sin(elevation),
            Math.cos(bearing) * Math.cos(elevation),
          ),
          point = r.project(r.camera.clone().add(dir.scale(100000)));
        if (!point || point.x < -w || point.x > w * 2 || point.y < -h || point.y > h * 2) continue;
        const size = r.focal * 1.6;
        c.save();
        c.translate(point.x, point.y);
        c.rotate(cloudScreenAngle(r));
        c.drawImage(image, -size * 0.5, -size * 0.25, size, size * 0.5);
        c.restore();
      }
  }
  if (r.cloudsEnabled !== false) renderCumulus(r, terrainWorld);
}
