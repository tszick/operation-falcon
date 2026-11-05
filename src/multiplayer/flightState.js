import { configureAircraft } from '../loadoutPlanner.js';
import { aircraft, loadout } from '../aircraftSpec.js';
import { createAircraft, stepAircraft, mass } from '../physics.js';
import { atmosphere } from '../atmosphere.js';
import { Vec3, Quat, clamp } from '../math.js';
import { createDamage, toggleActuator } from '../damage.js';
import { neutralAxes } from './protocol.js';
const fields = [
  'ammo',
  'countermeasures',
  'lastHit',
  'incomingMissiles',
  'fuel',
  'throttle',
  'engineSpool',
  'afterburnerSpool',
  'afterburner',
  'gear',
  'flaps',
  'flapPosition',
  'airbrake',
  'assist',
  'damage',
  'dying',
  'crashElapsed',
  'onGround',
  'airborne',
  'g',
  'speed',
  'ias',
  'mach',
  'agl',
  'alpha',
  'beta',
  'stalled',
  'warning',
  'crashed',
  'elapsed',
  'trueAirspeed',
  'landing',
  'landingMode',
  'bodyRates',
  'spin',
];
export function spawnAircraft(
  aircraftId,
  slot,
  seed,
  { armed = false, choice = null, fuelFraction = 0.7 } = {},
) {
  const base = aircraft.find((a) => a.id === aircraftId);
  const spec = choice ? configureAircraft(base, choice) : base;
  if (!spec) throw new Error('Unknown aircraft');
  const s = createAircraft(spec, {
    ammo: armed ? loadout(spec) : { gun: 0, aam: 0, agm: 0, bomb: 0 },
  });
  Object.assign(s, {
    position: new Vec3(slot * 100, 3000, -8000 + slot * 180),
    velocity: new Vec3(0, 0, 180),
    onGround: false,
    airborne: true,
    gear: false,
    flaps: false,
    flapPosition: 0,
    throttle: 0.7,
    engineSpool: 0.7,
    fuel: spec.fuelCapacity * fuelFraction,
    ...(choice ? { loadoutChoice: structuredClone(choice) } : {}),
    condition: createDamage(seed),
    speed: 180,
  });
  const cl = (mass(s) * 9.81) / (0.5 * atmosphere(3000).density * 180 ** 2 * spec.wingArea);
  s.orientation = Quat.euler(0, (cl - (spec.liftZero ?? 0.22)) / spec.clSlope, 0);
  s.ias = 180 * Math.sqrt(atmosphere(3000).density / 1.225);
  s.mach = 180 / atmosphere(3000).soundSpeed;
  return s;
}
export function applyFlightCommand(s, command, dt) {
  for (const key of command?.toggles || []) {
    if (key === 'assist') s.assist = !s.assist;
    else if (key === 'afterburner') s.afterburner = s.spec.hasAB && !s.afterburner;
    else toggleActuator(s, key);
  }
  stepAircraft(s, command?.axes || neutralAxes(), dt);
}
export function packFlight(s) {
  const out = {
    aircraftId: s.spec.id,
    ...(s.loadoutChoice ? { loadoutChoice: s.loadoutChoice } : {}),
    position: { ...s.position },
    velocity: { ...s.velocity },
    orientation: { ...s.orientation },
  };
  for (const key of fields) if (s[key] !== undefined) out[key] = s[key];
  // Bound visual history while retaining damage smoke on other pilots.
  out.condition = { ...s.condition, smoke: s.condition.smoke.slice(-16) };
  return structuredClone(out);
}
export function unpackFlight(data) {
  const base = aircraft.find((a) => a.id === data.aircraftId);
  const spec = data.loadoutChoice ? configureAircraft(base, data.loadoutChoice) : base;
  const s = createAircraft(spec, { ammo: { gun: 0, aam: 0, agm: 0, bomb: 0 } });
  const copy = structuredClone(data);
  if (copy.loadoutChoice) s.loadoutChoice = copy.loadoutChoice;
  for (const key of fields) if (copy[key] !== undefined) s[key] = copy[key];
  s.condition = copy.condition;
  for (const puff of s.condition.smoke)
    puff.position = new Vec3(puff.position.x, puff.position.y, puff.position.z);
  for (const decoy of s.countermeasures?.decoys || [])
    for (const key of ['position', 'previous', 'velocity']) {
      const v = decoy[key];
      if (v) decoy[key] = new Vec3(v.x, v.y, v.z);
    }
  s.position = new Vec3(copy.position.x, copy.position.y, copy.position.z);
  s.velocity = new Vec3(copy.velocity.x, copy.velocity.y, copy.velocity.z);
  s.orientation = new Quat(
    copy.orientation.x,
    copy.orientation.y,
    copy.orientation.z,
    copy.orientation.w,
  ).normalize();
  return s;
}
export function interpolateOrientation(a, b, fraction) {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const sign = dot < 0 ? -1 : 1;
  dot = Math.min(1, Math.abs(dot));
  const t = clamp(fraction, 0, 1),
    angle = Math.acos(dot),
    sin = Math.sin(angle);
  const wa = sin < 0.001 ? 1 - t : Math.sin((1 - t) * angle) / sin;
  const wb = (sin < 0.001 ? t : Math.sin(t * angle) / sin) * sign;
  return new Quat(
    a.x * wa + b.x * wb,
    a.y * wa + b.y * wb,
    a.z * wa + b.z * wb,
    a.w * wa + b.w * wb,
  ).normalize();
}
export function interpolateFlight(a, b, time) {
  const t = clamp((time - a.time) / Math.max(0.0001, b.time - a.time), 0, 1);
  const s = unpackFlight(b.state);
  s.position = new Vec3(a.state.position.x, a.state.position.y, a.state.position.z)
    .scale(1 - t)
    .add(new Vec3(b.state.position.x, b.state.position.y, b.state.position.z).scale(t));
  s.orientation = interpolateOrientation(a.state.orientation, b.state.orientation, t);
  return s;
}
