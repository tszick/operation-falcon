import { atmosphere } from './atmosphere.js';
import { clamp } from './math.js';
const profiles = new WeakMap();
export function flightModelProfile(spec) {
  if (profiles.has(spec)) return profiles.get(spec);
  const heavy = spec.emptyMass > 40000,
    transport = spec.transport || spec.id === 'airliner',
    old = spec.group === 'soviet' || spec.id === 'f4';
  const p = {
    engineTau: spec.engineResponseSeconds ?? (heavy ? 2.4 : transport ? 1.8 : old ? 1.35 : 0.9),
    pitchTau: spec.pitchResponseSeconds ?? (heavy ? 0.35 : transport ? 0.3 : 0.22),
    rollTau: spec.rollResponseSeconds ?? (heavy ? 0.28 : transport ? 0.2 : 0.1),
    yawTau: spec.yawResponseSeconds ?? (heavy ? 0.25 : 0.12),
    wingSpan: spec.wingSpan ?? Math.sqrt(spec.wingArea * 3.5),
    criticalMach:
      spec.criticalMach ?? (spec.maxMach > 1.2 ? 0.83 : Math.min(0.78, spec.maxMach * 0.9)),
    waveDragPeak: spec.waveDragPeak ?? (spec.maxMach > 1.2 ? 0.012 : 0.018),
  };
  profiles.set(spec, p);
  return p;
}
// Normalized delivered dry thrust follows demand; wet thrust has a separate ignition response.
export function stepEngine(s, dt, wetDemand = false) {
  const p = flightModelProfile(s.spec),
    target = s.fuel > 0 ? clamp(s.throttle, 0, 1) : 0;
  s.engineSpool ??= target;
  s.afterburnerSpool ??= 0;
  const tau = p.engineTau * (target > s.engineSpool ? 0.65 + 0.6 * (1 - s.engineSpool) : 0.55);
  s.engineSpool += (target - s.engineSpool) * -Math.expm1(-dt / Math.max(0.05, tau));
  const wet = wetDemand && s.engineSpool > 0.75 ? 1 : 0;
  s.afterburnerSpool += (wet - s.afterburnerSpool) * -Math.expm1(-dt / (wet ? 0.35 : 0.15));
  return s.fuel > 0
    ? (s.spec.thrust + (s.spec.abThrust - s.spec.thrust) * s.afterburnerSpool) * s.engineSpool
    : 0;
}
export function stepBodyRates(s, target, dt) {
  const p = flightModelProfile(s.spec),
    r = (s.bodyRates ??= { pitch: 0, roll: 0, yaw: 0 });
  for (const axis of ['pitch', 'roll', 'yaw']) {
    const demand = axis === 'roll' && s.onGround ? 0 : target[axis];
    const tau = p[axis + 'Tau'] * (s.onGround ? 0.5 : 1);
    r[axis] += (demand - r[axis]) * -Math.expm1(-dt / tau);
    if (Math.abs(r[axis]) < 1e-7 && demand === 0) r[axis] = 0;
  }
  return r;
}
export function groundEffectFactor(spec, wingHeight, bank = 0) {
  const span = flightModelProfile(spec).wingSpan;
  return 1 - 0.75 * Math.exp((-5 * Math.max(0, wingHeight)) / span) * Math.cos(bank) ** 2;
}
export function waveDragCoefficient(spec, mach) {
  const p = flightModelProfile(spec),
    x = clamp((mach - p.criticalMach) / (1.05 - p.criticalMach), 0, 1),
    rise = x * x * (3 - 2 * x);
  return (p.waveDragPeak * rise) / Math.sqrt(1 + 3 * Math.max(0, mach - 1.05) ** 2);
}

// Type-calibrated thrust lapse, shared by player physics and AI prediction.
// The published ceiling is a gameplay reference: clean, half fuel, healthy engines,
// maximum installed thrust, 0.508 m/s residual climb. Not a certified engine deck.
const altitudeProfiles = new WeakMap();
const machThrust = (spec, mach) => clamp(1 - (mach / spec.maxMach) * 0.22, 0.4, 1);
const installedMaximum = (spec) => (spec.hasAB ? spec.abThrust || spec.thrust : spec.thrust);
function lapse(density, anchorDensity, exponent) {
  const ratio = clamp(density / 1.225, 0, 1);
  return ratio >= anchorDensity
    ? ratio ** 0.75
    : anchorDensity ** 0.75 * (ratio / anchorDensity) ** exponent;
}
function climbScan(
  spec,
  height,
  massKg,
  factorAt,
  { engine = 1, lift = 1, drag = 0, thrust = installedMaximum(spec) } = {},
) {
  const air = atmosphere(height),
    weight = massKg * 9.81;
  const minSpeed =
    Math.sqrt((2 * weight) / (air.density * spec.wingArea * spec.maxCL * Math.max(0.01, lift))) *
    1.05;
  const maxSpeed = spec.maxMach * air.soundSpeed * 0.98;
  let best = null,
    bestSpeed = null;
  for (let i = 0; i <= 96 && minSpeed <= maxSpeed; i++) {
    const speed = minSpeed + ((maxSpeed - minSpeed) * i) / 96,
      mach = speed / air.soundSpeed;
    const q = 0.5 * air.density * speed * speed;
    const delivered = thrust * engine * factorAt(air, mach);
    let cl = weight / (q * spec.wingArea * Math.max(0.01, lift)),
      alpha;
    for (let trim = 0; trim < 8; trim++) {
      alpha = (cl - (spec.liftZero ?? 0.22)) / spec.clSlope;
      cl = (weight - delivered * Math.sin(alpha)) / (q * spec.wingArea * Math.max(0.01, lift));
    }
    alpha = (cl - (spec.liftZero ?? 0.22)) / spec.clSlope;
    if (Math.abs(alpha) > spec.stallAlpha || Math.abs(cl) > spec.maxCL) continue;
    const resistance =
      q *
      spec.wingArea *
      (spec.cd0 + spec.inducedDrag * cl * cl + waveDragCoefficient(spec, mach) + drag);
    const climb = ((delivered * Math.cos(alpha) - resistance) * speed) / weight;
    if (best === null || climb > best) {
      best = climb;
      bestSpeed = speed;
    }
  }
  return { maxClimbMps: best, bestSpeedMps: bestSpeed, canSustain: best !== null && best >= 0 };
}
export function altitudeProfile(spec) {
  if (altitudeProfiles.has(spec)) return altitudeProfiles.get(spec);
  const referenceMassKg = spec.ceilingReferenceMassKg ?? spec.emptyMass + spec.fuelCapacity * 0.5;
  const anchorDensity = atmosphere(spec.ceiling * 0.55).density / 1.225;
  let lo = 0.02,
    hi = 8;
  for (let i = 0; i < 36; i++) {
    const exponent = (lo + hi) / 2;
    const p = climbScan(
      spec,
      spec.ceiling,
      referenceMassKg,
      (air, mach) => lapse(air.density, anchorDensity, exponent) * machThrust(spec, mach),
    );
    if (p.maxClimbMps !== null && p.maxClimbMps > 0.508) lo = exponent;
    else hi = exponent;
  }
  const profile = {
    referenceMassKg,
    referenceClimbMps: 0.508,
    referenceAltitudeM: spec.ceiling,
    anchorDensity,
    lapseExponent: (lo + hi) / 2,
  };
  altitudeProfiles.set(spec, profile);
  return profile;
}
export function thrustFactor(spec, air, mach) {
  const p = altitudeProfile(spec);
  return lapse(air.density, p.anchorDensity, p.lapseExponent) * machThrust(spec, mach);
}
export function altitudePerformance(spec, height, massKg, options = {}) {
  return climbScan(spec, height, massKg, (air, mach) => thrustFactor(spec, air, mach), options);
}
