import { surfaceStyle } from './surfaceStyle.js';
import { Vec3 } from './math.js';
let cloudSprite;
function overcastSprite() {
  if (cloudSprite) return cloudSprite;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const c = canvas.getContext('2d');
  for (let i = 0; i < 22; i++) {
    const x = 32 + ((i * 79) % 448),
      y = 55 + ((i * 43) % 145),
      radius = 55 + (i % 4) * 12,
      g = c.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, i % 2 ? '#e1e4e635' : '#414c5a25');
    g.addColorStop(1, '#78838e00');
    c.fillStyle = g;
    c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  return (cloudSprite = canvas);
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
  if (p.clouds) {
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
        c.rotate(Math.atan2(-r.r.y, r.u.y));
        c.drawImage(image, -size * 0.5, -size * 0.25, size, size * 0.5);
        c.restore();
      }
  }
}
