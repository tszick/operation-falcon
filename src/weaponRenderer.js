import { Vec3, forward, right, up, clamp } from './math.js';
import { terrainHeight } from './terrain.js';
const project = (r, p) => (r.projectWorld ? r.projectWorld(p) : r.project(p));

function glow(c, p, radius, alpha = 1) {
  const r = Math.max(1, radius),
    gradient = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  gradient.addColorStop(0, `rgba(255,250,210,${alpha})`);
  gradient.addColorStop(0.2, `rgba(255,211,115,${alpha * 0.85})`);
  gradient.addColorStop(0.55, `rgba(248,128,45,${alpha * 0.45})`);
  gradient.addColorStop(1, 'rgba(238,94,25,0)');
  c.fillStyle = gradient;
  c.beginPath();
  c.arc(p.x, p.y, r, 0, Math.PI * 2);
  c.fill();
}
function contour(c, p, radius, phase, age) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2,
      rad = radius * (1 + 0.14 * Math.sin(i * 2.1 + phase + age));
    const x = p.x + Math.cos(angle) * rad,
      y = p.y + Math.sin(angle) * rad * 0.8;
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.closePath();
}
export function renderWeapons(renderer, s, weapons) {
  const r = renderer,
    c = r.ctx;
  // Detached smoke remains briefly after impact and drifts instead of following the missile.
  for (const trail of weapons.trails || []) {
    const age = trail.maxLife - trail.life,
      drift = new Vec3(age * 0.8, age * 0.6, 0);
    c.strokeStyle = `rgba(170,183,164,${0.28 * (trail.life / trail.maxLife)})`;
    c.lineWidth = Math.min(3, 0.65 + age * 0.8);
    c.beginPath();
    r.line(trail.from.clone().add(drift), trail.to.clone().add(drift));
    c.stroke();
  }
  for (const p of weapons.projectiles) {
    const direction = p.velocity.clone().normalize();
    if (p.type === 'flak') {
      c.strokeStyle = '#efa878';
      c.lineWidth = 1.2;
      c.beginPath();
      r.line(p.position.clone().sub(direction.clone().scale(10)), p.position);
      c.stroke();
      continue;
    }
    if (p.owner === 'enemy' && (p.type === 'aam' || p.type === 'agm')) {
      const point = project(r, p.position);
      if (point) {
        c.strokeStyle = '#ff9c69';
        c.strokeRect(point.x - 5, point.y - 5, 10, 10);
      }
    }
    if (p.type === 'gun') {
      // A newborn tracer cannot extend behind its launch point through the aircraft.
      const length = Math.min(65, Math.max(0, p.age || 0) * p.velocity.length()),
        tail = p.position.clone().sub(direction.clone().scale(length));
      c.strokeStyle = 'rgba(251,166,73,.25)';
      c.lineWidth = 4;
      c.beginPath();
      r.line(tail, p.position);
      c.stroke();
      c.strokeStyle = '#fff1bc';
      c.lineWidth = 1.25;
      c.beginPath();
      r.line(tail, p.position);
      c.stroke();
    } else if (p.type === 'aam' || p.type === 'agm') {
      c.strokeStyle = '#d9e2cc';
      c.lineWidth = 1.1;
      c.beginPath();
      r.line(
        p.position.clone().sub(direction.clone().scale(3)),
        p.position.clone().add(direction.clone().scale(1.5)),
      );
      c.stroke();
      if (p.age < (p.profile?.burn || 6)) {
        const tail = p.position.clone().sub(direction.clone().scale(3)),
          end = tail.clone().sub(direction.clone().scale(9 + Math.sin(p.age * 130) * 2));
        c.strokeStyle = 'rgba(255,142,46,.65)';
        c.lineWidth = 3;
        c.beginPath();
        r.line(tail, end);
        c.stroke();
        c.strokeStyle = '#fff6d2';
        c.lineWidth = 1;
        c.beginPath();
        r.line(tail, end.clone().add(direction.clone().scale(3)));
        c.stroke();
        const screen = project(r, tail);
        if (screen) glow(c, screen, clamp((5 * r.focal) / screen.depth, 1, 18), 0.5);
      }
    } else {
      c.strokeStyle = '#bdc4ac';
      c.lineWidth = 2;
      c.beginPath();
      r.line(
        p.position.clone().sub(direction.clone().scale(1)),
        p.position.clone().add(direction.clone().scale(1)),
      );
      c.stroke();
    }
  }
  for (const e of weapons.effects) {
    const age = e.age || 0;
    if (e.kind === 'muzzle') {
      const position = s.position
          .clone()
          .add(forward(s.orientation).scale(12))
          .add(right(s.orientation).scale(-1))
          .add(up(s.orientation).scale(-0.6)),
        p = project(r, position);
      if (p) {
        const fade = e.life / e.maxLife;
        glow(c, p, 20 * fade, 0.5 * fade);
        c.strokeStyle = `rgba(255,233,167,${fade})`;
        c.lineWidth = 1;
        c.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5;
          c.moveTo(p.x, p.y);
          c.lineTo(p.x + Math.cos(a) * 15 * fade, p.y + Math.sin(a) * 15 * fade);
        }
        c.stroke();
      }
      continue;
    }
    if (e.kind === 'practice-impact') {
      const point = project(r, e.position.clone().add(new Vec3(0, 0.5 + age * 0.3, 0)));
      if (point) {
        c.strokeStyle = `rgba(${e.hit ? '130,220,205' : '190,170,125'},${Math.max(0, 1 - age / 8)})`;
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(
          point.x,
          point.y,
          Math.min(18, ((1 + age * 1.5) * r.focal) / point.depth),
          0,
          Math.PI * 2,
        );
        c.stroke();
      }
      continue;
    }
    if (e.kind === 'impact') {
      c.strokeStyle = `rgba(255,191,102,${e.life / e.maxLife})`;
      c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * 0.785,
          offset = new Vec3(
            Math.cos(a) * age * 16,
            Math.max(0, age * 14 - 4.9 * age * age),
            Math.sin(a) * age * 16,
          ),
          p = e.position.clone().add(offset);
        r.line(p, p.clone().sub(offset.clone().scale(0.22)));
      }
      c.stroke();
      continue;
    }
    if (e.kind !== 'explosion') continue;
    const centre = e.position.clone().add(e.velocity.clone().scale(age * 0.25)),
      screen = project(r, centre),
      scale = e.scale || 1;
    if (screen && age < 0.65) {
      const radius = clamp(
          ((4 + Math.sin((Math.min(1, age / 0.4) * Math.PI) / 2) * 25) * scale * r.focal) /
            screen.depth,
          2,
          150,
        ),
        fade = clamp(1 - age / 0.65, 0, 1);
      glow(c, screen, radius * (age < 0.12 ? 1.8 : 1), fade * 0.9);
      c.strokeStyle = `rgba(255,198,100,${fade * 0.7})`;
      c.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const phase = i * 1.57,
          p = {
            x: screen.x + Math.cos(phase) * radius * 0.25,
            y: screen.y + Math.sin(phase) * radius * 0.2,
          };
        contour(c, p, radius * (0.55 + i * 0.06), phase, age * 8);
        c.stroke();
      }
      const distance = centre.distance(s.position);
      if (age < 0.12 && distance < 700) {
        c.fillStyle = `rgba(255,208,135,${0.07 * (1 - age / 0.12) * (1 - distance / 700)})`;
        c.fillRect(0, 0, r.w, r.h);
      }
    }
    // Small fading vector fragments follow ballistic paths and stop showing below the terrain.
    for (const particle of e.particles || []) {
      const position = e.position
        .clone()
        .add(e.velocity.clone().scale(age * 0.65))
        .add(particle.velocity.clone().scale(age))
        .add(new Vec3(0, -4.905 * age * age, 0));
      if (position.y < terrainHeight(position.x, position.z)) continue;
      const fade = clamp(1 - age / (particle.hot ? 2.4 : e.maxLife), 0, 1);
      if (!fade) continue;
      const angle = particle.phase + age * particle.spin,
        offset = new Vec3(
          Math.cos(angle) * particle.size,
          Math.sin(angle) * particle.size,
          Math.cos(angle * 0.7) * particle.size,
        );
      c.strokeStyle = particle.hot ? `rgba(255,185,98,${fade})` : `rgba(170,181,158,${fade * 0.7})`;
      c.lineWidth = particle.hot ? 1.25 : 0.8;
      c.beginPath();
      r.line(position.clone().sub(offset), position.clone().add(offset));
      r.line(position, position.clone().add(new Vec3(offset.z, offset.x, -offset.y)));
      c.stroke();
    }
    // Slow, irregular smoke outlines outlive the flash; no persistent expanding target ring.
    if (age > 0.08)
      for (const puff of e.smoke || []) {
        const position = centre
            .clone()
            .add(puff.offset.clone().scale(0.6 + age * 0.4))
            .add(new Vec3(age * 2, age * (e.ground ? 7 : 4), 0)),
          p = project(r, position);
        if (!p) continue;
        const radius = clamp(((puff.size + age * 12) * scale * r.focal) / p.depth, 0.5, 120),
          fade = clamp((1 - age / e.maxLife) * Math.min(1, age * 3), 0, 1);
        contour(c, p, radius, puff.phase, age * 0.35);
        c.fillStyle = `rgba(35,42,33,${fade * 0.1})`;
        c.strokeStyle = `rgba(139,150,129,${fade * 0.3})`;
        c.lineWidth = 0.8;
        c.fill();
        c.stroke();
      }
  }
  c.lineWidth = 1;
}
