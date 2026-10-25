import { clamp } from './math.js';
const profiles = new WeakMap();
export function flightModelProfile(spec) {
  if (profiles.has(spec)) return profiles.get(spec);
  const heavy = spec.emptyMass > 40000,
    transport = spec.transport || spec.id === 'airliner',
    old = spec.group === 'soviet' || spec.id === 'f4';
  const p = {
    engineTau: spec.engineResponseSeconds ?? (heavy ? 2.4 : transport ? 1.8 : old ? 1.35 : 0.9),
    pitchTau: spec.pitchResponseSeconds ?? (heavy ? 0.22 : transport ? 0.16 : 0.07),
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

// Installed thrust lapse: a bounded gameplay approximation, shared with AI demand prediction.
export function thrustFactor(spec, air, mach) {
  return (
    clamp((air.density / 1.225) ** 0.75, 0.015, 1) * clamp(1 - (mach / spec.maxMach) * 0.22, 0.4, 1)
  );
}
