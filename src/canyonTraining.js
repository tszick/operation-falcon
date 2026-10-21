import { Vec3, clamp } from './math.js';
import { terrainWorld, terrainHeight, pathPoint } from './terrain.js';
export const canyonColor = '#7edee7';
export function canyonPoint(along) {
  return pathPoint(terrainWorld.canyon, along);
}
export function createCanyonCourse() {
  const gates = [0, 2500, 5000, 7500, 10000, 12500, 15000, 18000].map((along, i) => {
    const p = canyonPoint(along),
      ground = terrainHeight(p.x, p.z);
    let y = ground + 195;
    // A climb corridor with advance clearance, rather than an abrupt vertical wall.
    if (i >= 5)
      for (let t = along; t <= 18000; t += 250) {
        const ahead = canyonPoint(t);
        y = Math.max(y, terrainHeight(ahead.x, ahead.z) + 220 - (t - along) * 0.22);
      }
    if (i === 7) y = Math.max(y, 1100);
    return {
      along,
      position: new Vec3(p.x, y, p.z),
      halfWidth: i < 5 ? 450 : 650,
      halfHeight: i < 5 ? 155 : 380,
    };
  });
  return { gates, index: 0, missed: false, previous: null };
}
export function updateCanyonCourse(s, m, w) {
  const course = s.canyonTraining;
  if (!course) return false;
  const gate = course.gates[course.index],
    a = course.previous || s.previousPosition || s.position,
    b = s.position;
  course.previous = b.clone();
  if (gate && a.z < gate.position.z && b.z >= gate.position.z) {
    const f = clamp((gate.position.z - a.z) / Math.max(1e-9, b.z - a.z), 0, 1),
      p = a.clone().add(b.clone().sub(a).scale(f));
    const valid =
      !s.onGround &&
      Math.abs(p.x - gate.position.x) <= gate.halfWidth &&
      Math.abs(p.y - gate.position.y) <= gate.halfHeight &&
      p.y > terrainHeight(p.x, p.z) + 35;
    course.missed = !valid;
    if (valid) {
      course.index++;
      w.emit?.({
        type: 'canyon-gate',
        gate: course.index,
        total: course.gates.length,
        time: s.elapsed,
      });
    }
  }
  m.objectives = [
    { id: 'valley', text: `Kanyon ${Math.min(course.index, 5)}/5`, done: course.index >= 5 },
    {
      id: 'ridge',
      text: `Gerinc ${Math.max(0, course.index - 5)}/3`,
      done: course.index === course.gates.length,
    },
  ];
  if (course.index === course.gates.length) {
    m.complete = true;
    m.objectiveComplete = true;
    m.score = Math.max(0, Math.round(2000 + (100 - s.damage) * 5 - s.elapsed));
    m.setPhase(
      'complete',
      'KANYONGYAKORLAT TELJESÍTVE',
      'A kanyont és a gerincet is biztonságosan átrepülted.',
    );
    return true;
  }
  m.setPhase(
    course.index < 5 ? 'canyon-run' : 'canyon-climb',
    course.index < 5 ? 'KANYONREPÜLÉS' : 'GERINC ÁTREPÜLÉSE',
    course.missed
      ? 'Kapu kihagyva: biztonságos magasságban fordulj vissza, és elölről repülj át rajta.'
      : course.index < 5
        ? 'Kövesd a türkiz kapukat. Tarts 40–350 méter terep feletti magasságot.'
        : 'Időben húzd fel az orrot; őrizd a sebességet és figyeld a G-terhelést.',
  );
  return true;
}
export function renderCanyonCourse(r, s) {
  const course = s.canyonTraining;
  if (!course || s.crashed || s.dying) return;
  const c = r.ctx;
  c.save();
  c.strokeStyle = canyonColor;
  c.lineWidth = 1.5;
  for (let i = course.index; i < Math.min(course.index + 3, course.gates.length); i++) {
    const g = course.gates[i],
      p = g.position,
      h = g.halfHeight,
      w = g.halfWidth;
    const corners = [
      new Vec3(p.x - w, p.y - h, p.z),
      new Vec3(p.x - w, p.y + h, p.z),
      new Vec3(p.x + w, p.y + h, p.z),
      new Vec3(p.x + w, p.y - h, p.z),
    ];
    c.globalAlpha = i === course.index ? 1 : 0.4;
    c.beginPath();
    corners.forEach((v, j) => r.line(v, corners[(j + 1) % 4]));
    c.stroke();
    const label = r.project(new Vec3(p.x, p.y + h + 40, p.z));
    if (label) {
      c.fillStyle = canyonColor;
      c.font = 'bold 13px Consolas,monospace';
      c.textAlign = 'center';
      c.fillText(
        `${i + 1}/${course.gates.length} · ${i < 5 ? 'KANYON' : i === 7 ? 'KIJÁRAT' : 'FELHÚZÁS'}`,
        label.x,
        label.y,
      );
    }
  }
  c.restore();
}
