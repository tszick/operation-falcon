import { engineLayout, syncEngines, publishEngines, engineResponse } from './engineDamage.js';
import { Vec3, clamp } from './math.js';

// Integrity is 0..1. A random fault pattern is chosen once per aircraft;
// fixed-step integration never rolls a new failure on every frame.
export function createDamage(seed = 1) {
  return {
    seed: seed >>> 0,
    side: (seed >>> 0) % 2 ? 'left' : 'right',
    actuator: ['gear', 'flaps', 'airbrake'][(seed >>> 1) % 3],
    applied: 0,
    parts: {
      leftWing: 1,
      rightWing: 1,
      tail: 1,
      fuselage: 1,
      engineLeft: 1,
      engineRight: 1,
      hydraulics: 1,
      weapons: 1,
    },
    rates: { roll: 0, pitch: 0, yaw: 0 },
    smoke: [],
    smokeClock: 0,
    source: '',
  };
}
export function ensureDamage(s) {
  const d = s.condition || (s.condition = createDamage());
  syncEngines(s.spec, d);
  return d;
}
function distribute(s, amount, part, source, engineIndex = null) {
  const d = ensureDamage(s),
    left = d.side === 'left',
    weights = {
      leftWing: left ? 0.75 : 0.25,
      rightWing: left ? 0.25 : 0.75,
      tail: 0.55,
      fuselage: 0.5,
      engineLeft: left ? 0.85 : 0.2,
      engineRight: left ? 0.2 : 0.85,
      hydraulics: 0.75,
      weapons: 0.9,
    };
  if (s.spec.engineCount === 1) {
    weights.engineLeft = 0.85;
    weights.engineRight = 0;
  }
  for (const key of Object.keys(d.parts).filter((k) => !k.startsWith('engine')))
    d.parts[key] = clamp(
      d.parts[key] - (amount / 100) * (part ? (key === part ? 1.65 : 0.12) : weights[key]),
      0,
      1,
    );
  const engineHit = part === 'engineLeft' || part === 'engineRight',
    index =
      Number.isInteger(engineIndex) && engineIndex >= 0 && engineIndex < d.engines.length
        ? engineIndex
        : engineLayout(s.spec).find((e) => e.side === (part === 'engineRight' ? 'right' : 'left'))
            ?.index;
  for (const e of engineLayout(s.spec)) {
    const weight = engineHit
      ? e.index === index
        ? 1.65
        : 0
      : part
        ? 0.12
        : weights[e.side === 'left' ? 'engineLeft' : 'engineRight'];
    d.engines[e.index] = clamp(d.engines[e.index] - (amount / 100) * weight, 0, 1);
  }
  publishEngines(s.spec, d);
  d.source = source || d.source;
}
export function syncDamage(s) {
  const d = ensureDamage(s);
  if (s.damage > d.applied) {
    distribute(s, s.damage - d.applied, null, 'Szerkezeti túlterhelés');
    d.applied = s.damage;
  }
  checkFailure(s);
  return d;
}
export function applyDamage(
  s,
  amount,
  { part = null, engineIndex = null, source = 'Találat' } = {},
) {
  if (s.crashed || s.dying || !Number.isFinite(amount) || amount <= 0) return;
  const d = ensureDamage(s);
  if (s.damage > d.applied) syncDamage(s);
  // A local engine hit must not count as the same loss of the entire airframe on an eight-engine bomber.
  const engineHit = part === 'engineLeft' || part === 'engineRight',
    share = engineHit ? engineLayout(s.spec).length : 1,
    added = Math.min(amount / share, 100 - s.damage);
  s.damage = clamp(s.damage + added, 0, 100);
  distribute(s, added * share, part, source, engineIndex);
  d.applied = s.damage;
  checkFailure(s);
}
function checkFailure(s) {
  const d = ensureDamage(s);
  if (
    !s.dying &&
    (s.damage >= 100 ||
      Math.min(d.parts.leftWing, d.parts.rightWing) < 0.09 ||
      d.parts.tail < 0.08 ||
      d.parts.fuselage < 0.08)
  ) {
    s.dying = true;
    s.damage = 100;
    d.applied = 100;
    s.deathStarted = s.elapsed || 0;
    if (Math.min(d.parts.leftWing, d.parts.rightWing) >= 0.09) d.parts[`${d.side}Wing`] = 0.08;
    d.parts.tail = Math.min(0.12, d.parts.tail);
    d.engines.fill(0);
    publishEngines(s.spec, d);
    s.afterburner = false;
    s.warning = 'IRÁNYÍTÁS ELVESZETT — VÉGZETES SZERKEZETI KÁR';
  }
}
export function damageStage(s) {
  if (s.crashed) return { id: 'impact', label: 'BECSAPÓDÁS' };
  if (s.dying) return { id: 'fatal', label: 'IRÁNYÍTÁS ELVESZETT' };
  const n = s.damage || 0;
  if (n < 15 && s.condition?.engines?.some((v) => v < 0.5))
    return { id: 'light', label: 'HAJTÓMŰHIBA' };
  return n >= 85
    ? { id: 'critical', label: 'KRITIKUS SÉRÜLÉS' }
    : n >= 65
      ? { id: 'severe', label: 'SÚLYOS SÉRÜLÉS' }
      : n >= 40
        ? { id: 'moderate', label: 'RENDSZERHIBÁK' }
        : n >= 15
          ? { id: 'light', label: 'ENYHE SZERKEZETI KÁR' }
          : { id: 'intact', label: 'RENDSZEREK ÜZEMKÉSZEK' };
}
export function damageResponse(s) {
  const p = ensureDamage(s).parts,
    wing = (p.leftWing + p.rightWing) / 2,
    hydraulic = 0.15 + 0.85 * p.hydraulics;
  const engines = engineResponse(s.spec, s.condition),
    severity = clamp(((s.damage || 0) - 15) / 85, 0, 1),
    critical = clamp(((s.damage || 0) - 60) / 35, 0, 1);
  return {
    wing,
    lift: wing,
    drag: (1 - wing) * 0.14 + (1 - p.tail) * 0.035 + (1 - (p.fuselage ?? 1)) * 0.05,
    control: s.dying ? 0 : hydraulic,
    rollControl: s.dying ? 0 : hydraulic * (0.2 + 0.8 * wing),
    pitchControl: s.dying ? 0 : hydraulic * p.tail,
    engine: s.dying ? 0 : engines.available,
    engines,
    shake: severity + critical * 0.8,
    weapons: !s.dying && p.weapons > 0.35,
  };
}
export function actuatorFault(s, name) {
  const d = ensureDamage(s);
  if (s.dying || s.crashed) return 'IRÁNYÍTÁS ELVESZETT';
  if (d.parts.hydraulics < 0.2 || (d.parts.hydraulics < 0.55 && d.actuator === name))
    return 'HIDRAULIKAHIBA — A MECHANIKA BESZORULT';
  return '';
}
export function toggleActuator(s, name) {
  const error = actuatorFault(s, name);
  if (error) return error;
  s[name] = !s[name];
  return '';
}
export function damageWarnings(s) {
  const d = ensureDamage(s),
    p = d.parts,
    w = [];
  if (s.dying) return ['IRÁNYÍTÁS ELVESZETT — VÉGZETES SZERKEZETI KÁR'];
  if (p.leftWing < 0.65 || p.rightWing < 0.65)
    w.push(`${p.leftWing < p.rightWing ? 'BAL' : 'JOBB'} SZÁRNY SÉRÜLT · ELLENKORMÁNYOZZ`);
  const engines = engineResponse(s.spec, d),
    failed = engines.health.map((health, i) => (health <= 0.12 ? i + 1 : null)).filter(Boolean);
  if (failed.length)
    w.push(
      `${failed.join(', ')}. HAJTÓMŰ KIESETT · ${engines.operating}/${engines.count} ÜZEMKÉPES`,
    );
  else if (engines.health.some((v) => v < 0.5)) w.push('HAJTÓMŰ SÉRÜLT · CSÖKKENT TOLÓERŐ');
  if (p.hydraulics < 0.55)
    w.push(
      `HIDRAULIKAHIBA · ${p.hydraulics < 0.2 ? 'TÖBB RENDSZER' : { gear: 'FUTÓMŰ', flaps: 'FÉKSZÁRNY', airbrake: 'LÉGFÉK' }[d.actuator]} BESZORULT`,
    );
  if (p.weapons <= 0.35) w.push('FEGYVERRENDSZER HIBA · RAKÉTAINDÍTÁS TILTVA');
  if (p.tail < 0.5) w.push('VEZÉRSÍK SÉRÜLT · GYENGE MAGASSÁGI KORMÁNY');
  return w;
}
export function damageMotion(s, q, m, cl, engineDemand, dt) {
  const d = ensureDamage(s),
    p = d.parts,
    r = d.rates,
    v = Math.max(0, s.trueAirspeed ?? s.velocity.length()),
    span = Math.sqrt(s.spec.wingArea * 3.5),
    length = span * 1.45;
  const response = damageResponse(s),
    flow = clamp(q / 6000, 0, 2),
    phase = (d.seed % 1000) * 0.01,
    t = s.elapsed;
  const rollMoment = q * s.spec.wingArea * 0.5 * cl * (p.leftWing - p.rightWing) * span * 0.22;
  const engineMoment =
    s.spec.engineCount === 1
      ? 0
      : (-engineDemand / response.engines.count) *
        engineLayout(s.spec).reduce((sum, e) => sum + e.x * response.engines.powers[e.index], 0);
  const buffet = response.shake * flow,
    damagedTail = 1 - p.tail;
  const pitchAcceleration = -damagedTail * 0.12 * flow + Math.sin(t * 17 + phase) * buffet * 0.09;
  const rollAcceleration =
    clamp(rollMoment / (m * (span * 0.27) ** 2), -3, 3) + Math.sin(t * 23 + phase) * buffet * 0.12;
  const yawAcceleration =
    clamp(engineMoment / (m * (length * 0.28) ** 2), -0.7, 0.7) +
    Math.sin(t * 11 + phase) * buffet * 0.025;
  const damp = 0.25 + flow * 1.7;
  r.roll = clamp((r.roll + rollAcceleration * dt) / (1 + damp * dt), -2.5, 2.5);
  r.pitch = clamp((r.pitch + pitchAcceleration * dt) / (1 + (0.2 + flow * 0.8) * dt), -1, 1);
  r.yaw = clamp((r.yaw + yawAcceleration * dt) / (1 + damp * dt), -0.8, 0.8);
  // At zero airspeed a damaged surface does not generate aerodynamic torque.
  if (v < 1 && !s.dying) {
    r.roll *= 0.98;
    r.pitch *= 0.98;
    r.yaw *= 0.98;
  }
  return r;
}
export function structuralLoadLimits(s) {
  const p = s.condition?.parts,
    wing = Math.min(p?.leftWing ?? 1, p?.rightWing ?? 1);
  return { positive: s.spec.maxG * (0.65 + 0.35 * wing), negative: -s.spec.maxG * 0.4 };
}
export function updateDamage(s, dt) {
  const d = syncDamage(s),
    p = d.parts,
    response = damageResponse(s);
  if (!s.dying) {
    const limits = structuralLoadLimits(s);
    const overload = Math.max(0, s.g - limits.positive, limits.negative - s.g);
    const maxIAS = Math.min(440, s.spec.maxMach * 340 * 0.85);
    const overspeed =
      Math.max(0, s.mach - s.spec.maxMach) * 7 + Math.max(0, s.ias / maxIAS - 1) * 4;
    const fire = d.engines.some((v) => v < 0.25) && s.fuel > 0 ? 0.35 + s.throttle * 0.6 : 0;
    applyDamage(s, (overload * 1.5 + overspeed + fire) * dt, {
      source: fire ? 'Hajtóműtűz' : overload ? 'Túlterhelés' : 'Túl nagy sebesség',
    });
  }
  for (const puff of d.smoke) {
    puff.age += dt;
    puff.position.y += dt * 2;
  }
  d.smoke = d.smoke.filter((p) => p.age < 5);
  d.smokeClock += dt;
  if (
    (s.damage > 35 || s.dying || d.engines.some((v) => v < 0.3)) &&
    !s.crashed &&
    d.smokeClock > 0.09
  ) {
    d.smokeClock = 0;
    const engines = engineLayout(s.spec).filter(
        (e) => d.engines[e.index] < 0.3 && (!e.wing || p[e.wing + 'Wing'] >= 0.09),
      ),
      engine = engines[Math.floor(s.elapsed / 0.09) % Math.max(1, engines.length)],
      origin = engine
        ? s.orientation.rotate(new Vec3(engine.x, engine.y, engine.z)).add(s.position)
        : s.position.clone();
    d.smoke.push({ position: origin, age: 0, hot: !!engine });
    if (d.smoke.length > 65) d.smoke.shift();
  }
  return response;
}
export function recordImpact(s, reasons = []) {
  if (s.crashed) return;
  if (s.lastImpact?.time !== s.elapsed)
    s.lastImpact = {
      time: s.elapsed,
      position: { ...s.position },
      velocity: { ...s.velocity },
      damage: s.damage,
      source: s.condition?.source,
      reason: reasons.join(' '),
    };
  s.crashed = true;
  s.dying = false;
  s.damage = 100;
  s.crashElapsed = 0;
  s.impactPending = true;
  s.afterburner = false;
  s.landing = {
    success: false,
    descent: Math.max(0, -s.velocity.y),
    reasons: reasons.length
      ? reasons
      : [ensureDamage(s).source || 'A sérült repülőgép a földnek csapódott.'],
  };
  s.position.y = Math.max(0, s.position.y);
  s.velocity = new Vec3();
  s.speed = 0;
  s.ias = 0;
  s.mach = 0;
  s.enginePower = 0;
  s.onGround = true;
  s.warning = 'BECSAPÓDÁS';
}
export function advanceCrashSequence(s, dt) {
  if (!s.crashed) return false;
  s.crashElapsed = (s.crashElapsed || 0) + dt;
  return s.crashElapsed >= 5;
}

// Presentation-only angular vibration. Physics buffet remains in damageMotion.
export function damageVibration(s) {
  const amount =
      s.onGround || s.crashed
        ? 0
        : damageResponse(s).shake * clamp(s.velocity.length() / 100, 0, 1),
    phase = (s.condition.seed % 1000) * 0.01,
    t = s.elapsed;
  return {
    pitch: Math.sin(t * 31 + phase) * amount * 0.0045,
    yaw: Math.sin(t * 37 + phase) * amount * 0.002,
    roll: Math.sin(t * 23 + phase) * amount * 0.003,
  };
}
