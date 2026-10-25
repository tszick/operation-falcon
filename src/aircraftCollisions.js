import { Vec3, Quat, clamp } from './math.js';
import { aircraftMesh } from './airframes.js';
import { aircraftFlightSpec } from './aiAircraftSpec.js';
import { aircraftHit } from './hitGeometry.js';
import { groundAircraftHit, groundCollisionBounds, sweptBoundsOverlap } from './groundModels.js';
import { damagedVertex } from './modelDamage.js';
import { applyDamage, recordImpact } from './damage.js';
import { applyTargetHit } from './targeting.js';
import { mass } from './performance.js';
import { unitDefinition } from './unitTypes.js';

const probeIndices = new WeakMap(),
  contacts = new WeakMap();
function actor(entity, player = false) {
  const flight = player ? entity : entity.flight;
  if (
    player ? entity.crashed && !entity.impactPending : entity.flight?.crashed && !entity.impactReady
  )
    return null;
  const state = flight || {
    spec: aircraftFlightSpec(entity.aircraftId || 'mig29'),
    position: entity.position,
    previousPosition: entity.previousPosition,
    velocity: entity.velocity,
    orientation: Quat.euler(entity.heading || 0, entity.pitch || 0, entity.bank || 0),
    onGround: false,
  };
  const velocity =
    state.crashed && state.lastImpact?.velocity
      ? Object.assign(new Vec3(), state.lastImpact.velocity)
      : state.velocity;
  return {
    entity,
    player,
    state,
    velocity,
    id: player ? 'PLAYER' : entity.id,
    mesh: aircraftMesh(state.spec.id, 0, state.flapPosition || 0),
  };
}
function probes(a) {
  let indices = probeIndices.get(a.mesh);
  if (!indices) {
    indices = [
      ...new Set(
        [
          ['x', 1],
          ['x', -1],
          ['y', 1],
          ['z', 1],
          ['z', -1],
        ].map(([axis, sign]) =>
          a.mesh.points.reduce(
            (best, p, index) => (sign * p[axis] > sign * a.mesh.points[best][axis] ? index : best),
            0,
          ),
        ),
      ),
    ];
    probeIndices.set(a.mesh, indices);
  }
  const previous = a.state.previousPosition || a.state.position,
    orientation = a.state.previousOrientation || a.state.orientation;
  return [
    new Vec3(),
    ...indices.map((index) => damagedVertex(a.mesh, index, a.state.condition)),
  ].map((p) => ({
    from: orientation.rotate(p).add(previous),
    to: a.state.orientation.rotate(p).add(a.state.position),
  }));
}
function airContact(a, b) {
  const from = (a.state.previousPosition || a.state.position)
      .clone()
      .sub(b.state.previousPosition || b.state.position),
    to = a.state.position.clone().sub(b.state.position),
    delta = to.clone().sub(from),
    t = clamp(-from.dot(delta) / Math.max(1e-9, delta.dot(delta)), 0, 1);
  if (from.add(delta.scale(t)).length() > a.mesh.radius + b.mesh.radius + 1) return null;
  for (const [first, second] of [
    [a, b],
    [b, a],
  ])
    for (const probe of probes(first)) {
      const hit = aircraftHit(second.state, probe.from, probe.to, { radius: 0.75 });
      if (hit) return hit;
    }
  return null;
}
function seen(a, target) {
  let set = contacts.get(a.entity);
  if (!set) contacts.set(a.entity, (set = new WeakSet()));
  if (set.has(target)) return true;
  set.add(target);
  return false;
}
function destroyAircraft(a, reason) {
  if (a.state.crashed) return;
  if (a.player) {
    if (a.state.onGround) recordImpact(a.state, [reason]);
    else applyDamage(a.state, 100, { part: 'fuselage', source: reason });
  } else {
    applyTargetHit(a.entity, 'collision', { amount: 100, part: 'fuselage' });
    a.entity.flight.condition.source = reason;
    if (a.state.onGround) {
      recordImpact(a.entity.flight, [reason]);
      a.entity.falling = false;
      a.entity.impactReady = true;
    }
  }
}
function hitEvent(weapons, source, target, point, amount, destroyed) {
  weapons.emit({
    type: 'target-hit',
    weapon: 'collision',
    sourceId: source.id,
    targetId: target.id,
    position: point.clone(),
    amount,
    destroyed,
  });
}
export function updateAircraftCollisions(player, targets, weapons) {
  const actors = [
    actor(player, true),
    ...targets
      .filter(
        (t) =>
          t.kind === 'air' &&
          t.type !== 'ballistic' &&
          !t.playerControlled &&
          !t.pending &&
          !t.exited &&
          (t.alive || t.falling || t.impactReady),
      )
      .map((t) => actor(t)),
  ].filter(Boolean);
  for (let i = 0; i < actors.length; i++)
    for (let j = i + 1; j < actors.length; j++) {
      const a = actors[i],
        b = actors[j];
      if (a.state.crashed || b.state.crashed || contacts.get(a.entity)?.has(b.entity)) continue;
      const hit = airContact(a, b);
      if (!hit || seen(a, b.entity)) continue;
      seen(b, a.entity);
      destroyAircraft(a, 'Összeütközés egy másik repülőgéppel.');
      destroyAircraft(b, 'Összeütközés egy másik repülőgéppel.');
      weapons.emit({
        type: 'collision',
        sourceId: a.id,
        targetId: b.id,
        position: hit.point.clone(),
        relativeSpeedMps: a.velocity.clone().sub(b.velocity).length(),
      });
      if (!b.player) hitEvent(weapons, a, b.entity, hit.point, 100, true);
      if (!a.player) hitEvent(weapons, b, a.entity, hit.point, 100, true);
    }
  const ground = targets.filter((t) => t.kind === 'ground' && !t.pending && !t.exited);
  const bounds = new Map();
  for (const a of actors) {
    let paths;
    const from = a.state.previousPosition || a.state.position;
    for (const target of ground) {
      if (contacts.get(a.entity)?.has(target)) continue;
      let box = bounds.get(target);
      if (!box) bounds.set(target, (box = groundCollisionBounds(target)));
      // The origin base has its own rendered hangar layout; its nominal airport box differs.
      if (
        !(target.home && !target.remoteHome && target.type === 'airbase') &&
        !sweptBoundsOverlap(box, from, a.state.position, a.mesh.radius)
      )
        continue;
      paths ||= probes(a);
      let contact = null;
      for (const path of paths) {
        const hit = groundAircraftHit(target, path.from, path.to);
        if (hit && (!contact || hit.fraction < contact.fraction)) contact = hit;
      }
      if (!contact || seen(a, target)) continue;
      const speed = a.velocity
          .clone()
          .sub(target.velocity || new Vec3())
          .length(),
        weight = a.state.fuel !== undefined ? mass(a.state) : a.state.spec.emptyMass || 10000,
        energy = 0.5 * weight * speed * speed,
        amount = clamp(energy / 2000000, 5, 400),
        alive = target.alive;
      destroyAircraft(a, 'Ütközés tereptárggyal: ' + (target.name || target.type) + '.');
      if (alive) {
        target.maxHealth ||= unitDefinition(target.type).health;
        target.health ??= target.maxHealth;
        const destroyed = applyTargetHit(target, 'collision', { amount });
        if (destroyed) target.impactReady = true;
        hitEvent(weapons, a, target, contact.point, amount, destroyed);
      }
      weapons.emit({
        type: 'collision',
        sourceId: a.id,
        targetId: target.id,
        position: contact.point.clone(),
        relativeSpeedMps: speed,
        energyJ: energy,
      });
      break;
    }
  }
}
