import { terrainHeight } from './terrain.js';
// Score actual ground contact, never a blast radius, model bounding box or lock.
export function practiceBombImpact(s, p, targets) {
  const range = targets.find((t) => t.id === s.bombingPractice?.targetId && t.practiceTarget),
    a = p.previous,
    b = p.position;
  let lo = 0,
    hi = 1;
  for (let n = 0; n < 18; n++) {
    const f = (lo + hi) / 2,
      x = a.x + (b.x - a.x) * f,
      y = a.y + (b.y - a.y) * f,
      z = a.z + (b.z - a.z) * f;
    if (y > terrainHeight(x, z)) lo = f;
    else hi = f;
  }
  const point = a.clone().add(b.clone().sub(a).scale(hi));
  point.y = terrainHeight(point.x, point.z);
  const distance = range
      ? Math.hypot(point.x - range.position.x, point.z - range.position.z)
      : null,
    hit = !!range && distance <= range.radius;
  const result = {
    projectileId: p.id,
    targetId: range?.id || null,
    position: point,
    distanceM: distance,
    hit,
    time: s.elapsed,
  };
  if (s.bombingPractice && p.practice) {
    s.bombingPractice.impacts.push(result);
    s.bombingPractice.hits = s.bombingPractice.impacts.filter((i) => i.hit).length;
    result.hits = s.bombingPractice.hits;
    result.resolved = s.bombingPractice.impacts.length;
    result.shotNumber = p.practiceShot ?? s.bombingPractice.impacts.length;
  }
  return result;
}
export function updateBombingPractice(s, m, targets, w) {
  if (s.airborne) m.departed = true;
  const hits = s.bombingPractice?.hits || 0,
    remaining = s.ammo.bomb || 0,
    pending = w.projectiles.filter((p) => p.practice).length,
    landed = !!(s.airborne && s.onGround && s.landing?.success && s.speed < 5);
  m.objectiveComplete = hits >= 2;
  m.objectives = [
    {
      id: 'practice-hits',
      text: `Célkör-találat: ${hits}/2 · megmaradt bomba: ${remaining}/3`,
      hits,
      requiredHits: 2,
      remainingBombs: remaining,
      pendingBombs: pending,
      done: hits >= 2,
    },
    { id: 'landing', text: 'Biztonságos leszállás és megállás', done: landed },
  ];
  if (hits + remaining + pending < 2 || (landed && hits < 2 && pending === 0)) {
    m.failed = true;
    m.failureReason =
      'A három gyakorlóbombából legalább kettőnek ugyanabba a célkörbe kell találnia. Nincs újratöltés.';
    m.objectives[0].status = 'failed';
    m.setPhase('failed', 'GYAKORLAT SIKERTELEN', m.failureReason);
    return;
  }
  if (landed && hits >= 2 && pending === 0) {
    m.complete = true;
    m.score = Math.max(0, Math.round(1000 + hits * 200 + (100 - s.damage) * 5 - s.elapsed * 0.2));
    m.setPhase(
      'complete',
      'GYAKORLAT TELJESÍTVE',
      'Legalább két találat, sikeres leszállás és megállás.',
    );
    return;
  }
  if (landed && pending > 0) {
    m.setPhase(
      'bombs-pending',
      'BOMBÁK BECSAPÓDÁSA',
      `Várd meg a még úton levő ${pending} gyakorlóbomba becsapódását. Maradj álló helyzetben.`,
    );
    return;
  }
  if (s.onGround && s.landing?.success) {
    m.setPhase('rollout', 'KIFUTÁS', 'Gáz le, Ctrl: kerékfék a teljes megállásig.');
    return;
  }
  if (s.approach?.active) {
    m.setPhase(
      s.approach.stage === 'SZINTBE VÉTEL' ? 'flare' : 'landing',
      `LESZÁLLÁS · ${s.approach.stage}`,
      s.approach.instruction,
    );
    return;
  }
  if (hits >= 2) {
    m.setPhase(
      'return',
      'HAZATÉRÉS',
      'A két találat megvan. BASE: hazatérés, N: leszállási segéd.',
    );
    return;
  }
  if (!s.airborne) {
    m.setPhase(
      s.speed > 1 || s.throttle > 0.05 ? 'takeoff' : 'preflight',
      'FELSZÁLLÁS · BOMBAKIKÉPZÉS',
      'R: teljes gáz, S: orr fel, G: futómű be, X: fékszárny be.',
    );
    return;
  }
  m.setPhase(
    'bomb-run',
    'GYAKORLÓBOMBÁZÁS',
    `4: inert bomba. CCIP a célkörbe, Szóköz: egy bomba. Találat: ${hits}/2; maradt ${remaining}.`,
  );
}
