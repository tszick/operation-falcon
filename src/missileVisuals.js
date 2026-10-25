import { clamp } from './math.js';
// Flames are short optical sprites, not kilometre-long near-plane-clipped lines.
export function missileAppearance(r, p) {
  const point = r.projectWorld ? r.projectWorld(p.position) : r.project(p.position);
  if (!point || !Number.isFinite(point.depth) || point.depth < 2) return null;
  const direction = p.velocity.clone().normalize(),
    tail = r.project(p.position.clone().sub(direction));
  const dx = tail ? tail.x - point.x : 0,
    dy = tail ? tail.y - point.y : 0,
    length = Math.hypot(dx, dy);
  const axis = length > 0.001 ? { x: dx / length, y: dy / length } : { x: 0, y: 0 };
  const burn = p.profile?.burn ?? 6;
  const flame = burn > 0 ? clamp((burn - (p.age || 0)) / 0.25, 0, 1) : 0;
  return {
    point,
    axis,
    bodyPixels: clamp((4.5 * r.focal) / point.depth, 0.35, 12),
    flamePixels: clamp((10 * r.focal) / point.depth, 0, 24) * flame,
    flame,
    glowPixels: clamp((5 * r.focal) / point.depth, 1, 18),
  };
}
