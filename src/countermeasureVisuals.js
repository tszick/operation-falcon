import { Vec3, clamp } from './math.js';
let flareSprite;
function sprite() {
  if (flareSprite || typeof document === 'undefined') return flareSprite;
  flareSprite = document.createElement('canvas');
  flareSprite.width = flareSprite.height = 64;
  const c = flareSprite.getContext('2d'),
    g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,249,214,1)');
  g.addColorStop(0.2, 'rgba(255,168,65,.9)');
  g.addColorStop(1, 'rgba(255,110,30,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  return flareSprite;
}
const project = (r, p) => (r.projectWorld ? r.projectWorld(p) : r.project(p));
export function renderCountermeasures(r, s) {
  const c = r.ctx;
  for (const d of s.countermeasures?.decoys || []) {
    const p = project(r, d.position);
    if (!p) continue;
    const fade = 1 - d.age / d.life;
    c.lineWidth = 1;
    if (d.type === 'flare') {
      const radius = clamp((2.5 * r.focal) / p.depth, 1.5, 12),
        image = sprite();
      if (image) {
        const alpha = c.globalAlpha;
        c.globalAlpha = alpha * fade;
        c.drawImage(image, p.x - radius * 3, p.y - radius * 3, radius * 6, radius * 6);
        c.globalAlpha = alpha;
      } else {
        const glow = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 3);
        glow.addColorStop(0, `rgba(255,249,214,${fade})`);
        glow.addColorStop(0.2, `rgba(255,168,65,${fade * 0.9})`);
        glow.addColorStop(1, 'rgba(255,110,30,0)');
        c.fillStyle = glow;
        c.fillRect(p.x - radius * 3, p.y - radius * 3, radius * 6, radius * 6);
      }
      c.strokeStyle = `rgba(255,222,162,${fade})`;
      c.beginPath();
      r.line(d.position, d.position.clone().sub(d.velocity.clone().normalize().scale(3)));
      c.stroke();
    } else {
      if (((2 + d.age * 2) * r.focal) / p.depth < 1.5) {
        c.fillStyle = `rgba(167,211,222,${fade * 0.6})`;
        c.fillRect(p.x - 0.5, p.y - 0.5, 1, 1);
        continue;
      }
      c.strokeStyle = `rgba(167,211,222,${fade * 0.7})`;
      c.beginPath();
      for (let i = 0; i < 9; i++) {
        const phase = i * 2.399 + d.id,
          spread = 2 + d.age * 2,
          offset = new Vec3(
            Math.cos(phase) * spread,
            Math.sin(phase * 1.7) * spread * 0.5,
            Math.sin(phase) * spread,
          );
        r.line(
          d.position.clone().add(offset),
          d.position
            .clone()
            .add(offset)
            .add(new Vec3(0.7, 1, 0.3)),
        );
      }
      c.stroke();
    }
  }
}
