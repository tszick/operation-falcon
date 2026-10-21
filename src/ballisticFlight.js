import { Vec3, clamp } from './math.js';
import { terrainHeight } from './terrain.js';
// Compressed powered arc followed by gravity-only coast, tuned to the game map.
// The ballistic target is an entity, not a homing weapon/projectile.
export function launchBallistic(silo, base) {
  const position = silo.position.clone().add(new Vec3(0, 8, 0)),
    delta = base.position.clone().sub(position),
    end = position.clone().add(new Vec3(delta.x * 0.2, 8500, delta.z * 0.2)),
    toBase = base.position.clone().sub(end),
    coastTime = Math.max(2, toBase.length() / 3300);
  const endVelocity = new Vec3(
    toBase.x / coastTime,
    (toBase.y + 4.905 * coastTime ** 2) / coastTime,
    toBase.z / coastTime,
  );
  return {
    id: 'BALLISTIC',
    type: 'ballistic',
    kind: 'air',
    team: silo.team || 'enemy',
    faction: silo.faction,
    name: 'Interkontinentális rakéta',
    alive: true,
    position,
    previousPosition: position.clone(),
    velocity: new Vec3(0, 3300, 0),
    heading: 0,
    pitch: Math.PI / 2,
    radius: 2,
    health: 25,
    maxHealth: 25,
    threats: [],
    targetId: base.id,
    ballistic: { age: 0, boost: 3, start: position.clone(), end, endVelocity, coastTime },
    sourceId: silo.id,
  };
}
export function moveBallistic(t, dt) {
  const b = t.ballistic;
  b.age += dt;
  if (b.age <= b.boost) {
    const u = clamp(b.age / b.boost, 0, 1),
      u2 = u * u,
      u3 = u2 * u,
      a = b.start,
      c = b.end,
      v0 = new Vec3(0, 3300, 0),
      v1 = b.endVelocity,
      T = b.boost;
    t.position = a
      .clone()
      .scale(2 * u3 - 3 * u2 + 1)
      .add(v0.clone().scale((u3 - 2 * u2 + u) * T))
      .add(c.clone().scale(-2 * u3 + 3 * u2))
      .add(v1.clone().scale((u3 - u2) * T));
    t.velocity = a
      .clone()
      .scale((6 * u2 - 6 * u) / T)
      .add(v0.scale(3 * u2 - 4 * u + 1))
      .add(c.clone().scale((-6 * u2 + 6 * u) / T))
      .add(v1.clone().scale(3 * u2 - 2 * u));
  } else {
    const age = b.age - b.boost;
    t.position = b.end
      .clone()
      .add(b.endVelocity.clone().scale(age))
      .add(new Vec3(0, -4.905 * age * age, 0));
    t.velocity = b.endVelocity.clone().add(new Vec3(0, -9.81 * age, 0));
  }
  t.heading = Math.atan2(t.velocity.x, t.velocity.z);
  t.pitch = Math.atan2(t.velocity.y, Math.hypot(t.velocity.x, t.velocity.z));
  if (t.position.y <= terrainHeight(t.position.x, t.position.z) || b.age >= b.boost + b.coastTime) {
    t.alive = false;
    t.impacted = true;
    t.impactReady = true;
  }
}
export function ballisticHit(t, from, to, padding = 0) {
  const a = from.clone().sub(t.previousPosition || t.position),
    delta = to.clone().sub(t.position).sub(a),
    fraction = clamp(-a.dot(delta) / Math.max(1e-12, delta.dot(delta)), 0, 1);
  return a.add(delta.scale(fraction)).length() <= (t.radius || 2) + padding
    ? { part: 'fuselage', point: from.clone().add(to.clone().sub(from).scale(fraction)) }
    : null;
}
