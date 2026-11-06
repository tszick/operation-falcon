import { Vec3 } from '../math.js';
import { packFlight, unpackFlight } from './flightState.js';
import { weaponProfiles } from '../weaponDynamics.js';
const vector = (v) => new Vec3(v.x, v.y, v.z);
export function packProjectile(p) {
  return {
    id: p.id,
    type: p.type,
    profile: p.profile.id,
    sourceId: p.sourceId,
    owner: p.owner,
    targetId: p.targetEntityId || p.targetId,
    position: { ...p.position },
    velocity: { ...p.velocity },
    age: p.age,
    armed: !!p.armed,
    seekerLost: !!p.seekerLost,
  };
}
export function unpackProjectile(p) {
  return {
    ...p,
    profile: weaponProfiles[p.profile],
    position: vector(p.position),
    velocity: vector(p.velocity),
  };
}
export function packTarget(t) {
  const out = {};
  for (const key of [
    'id',
    'name',
    'kind',
    'type',
    'team',
    'aircraftId',
    'alive',
    'falling',
    'radius',
    'health',
    'maxHealth',
    'damage',
    'heading',
    'exited',
    'retired',
    'aiControlled',
    'rangeTarget',
    'home',
    'displayCallSign',
    'remoteHome',
  ])
    if (t[key] !== undefined) out[key] = t[key];
  if (t.aiControlled)
    out.aiState = t.exited
      ? 'withdrawn'
      : t.falling
        ? 'falling'
        : !t.alive
          ? 'destroyed'
          : t.retreat
            ? 'returning'
            : t.evasion
              ? 'evading'
              : 'engaging';
  out.position = { ...t.position };
  out.velocity = { ...t.velocity };
  if (t.flight) out.flight = packFlight(t.flight);
  return out;
}
export function unpackTarget(t) {
  const out = { ...t, position: vector(t.position), velocity: vector(t.velocity), threats: [] };
  if (t.flight) {
    out.flight = unpackFlight(t.flight);
    out.defense = out.flight;
  }
  return out;
}
