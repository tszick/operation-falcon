import { carrierLocalPosition } from './recoveryAirfields.js';
import { navalFlight, onCarrierDeck, carrierTouchdown, vtolApproach } from './navalOps.js';
import { attitude, DEG, Quat } from './math.js';
import { runway, homeHangars } from './terrain.js';
import { approachSpeeds, atmosphere } from './performance.js';
import { flapStatus } from './flaps.js';

// Alternate AI airfields use the same landing checks in runway-local coordinates.
export function runwayState(s) {
  if (!s.airfield || s.airfieldLocal) return s;
  const f = s.airfield,
    rotation = Quat.euler(-f.heading, 0, 0),
    local = (p) => {
      const v = rotation.rotate(p.clone().sub(f.position));
      v.y = p.y - f.elevation;
      return v;
    };
  return {
    ...s,
    position: local(s.position),
    previousPosition: local(s.previousPosition || s.position),
    velocity: rotation.rotate(s.velocity),
    wind: s.wind ? rotation.rotate(s.wind) : null,
    orientation: rotation.multiply(s.orientation),
    worldAltitude: s.position.y,
    airfieldLocal: true,
  };
}
export function onLandingRunway(s) {
  if (navalFlight(s) && s.spec.vtol && (s.naval?.nozzle || 0) >= 75)
    return onCarrierDeck(s.position, s.airfield);
  const v = runwayState(s),
    strip = s.airfield || runway;
  return Math.abs(v.position.x) < strip.halfWidth && Math.abs(v.position.z) < strip.halfLength;
}
export function landingGroundHeight(s, terrain) {
  return navalFlight(s) && onCarrierDeck(s.position, s.airfield)
    ? s.airfield.elevation
    : s.airfield && onLandingRunway(s)
      ? s.airfield.elevation
      : terrain;
}
// Approach detection is independent of mission completion and works from both ends.
export function evaluateApproach(s) {
  if (s.recoveryExit)
    return { active: false, instruction: 'Kivonulási pont: nincs saját fedélzeti leszállás.' };
  if (navalFlight(s) && s.spec.vtol && (s.naval?.nozzle || 0) >= 75) return vtolApproach(s);
  s = runwayState(s);
  const strip = s.airfield || runway;
  const a = attitude(s.orientation);
  const direction = strip.carrier
    ? 1
    : Math.abs(s.position.z) > strip.halfLength
      ? s.position.z < 0
        ? 1
        : -1
      : s.velocity.z >= 0
        ? 1
        : -1;
  const desired = direction > 0 ? 0 : Math.PI;
  const headingError =
    Math.atan2(Math.sin(a.heading - desired), Math.cos(a.heading - desired)) / DEG;
  const distance = Math.max(
    0,
    -direction * (s.position.z + direction * (strip.touchdownOffset ?? strip.halfLength)),
  );
  const lateral = Math.abs(s.position.x);
  const height = s.position.y;
  const sink = -s.velocity.y;
  const horizontalSpeed = Math.hypot(s.velocity.x, s.velocity.z);
  const angle = Math.atan2(sink, Math.max(1, horizontalSpeed)) / DEG;
  const idealHeight = 2 + distance * Math.tan((strip.glideDeg || 3) * DEG);
  const glideError = height - idealHeight;
  const corridor = lateral < Math.min(650, 100 + distance * 0.1) && Math.abs(headingError) < 30;
  const arriving =
    s.velocity.y < -0.15 ||
    (s.approach?.active && s.velocity.y < 3) ||
    (distance > 300 && s.gear && s.velocity.y < 1.5);
  const auto =
    s.airborne &&
    !s.onGround &&
    distance < 7000 &&
    height < 650 &&
    corridor &&
    s.velocity.z * direction > 15 &&
    arriving &&
    (distance > 0 || onLandingRunway(s));
  // Explicit pilot selection also provides the route home from outside final approach range.
  const active =
    !s.onGround &&
    !s.crashed &&
    !s.dying &&
    (s.landingMode === 'on' || (s.landingMode !== 'off' && auto));
  const near = distance < 350 && height < 35;
  const speeds = approachSpeeds(s),
    targetSpeed = speeds.target;
  const speed = s.ias * 3.6;
  const minSpeed = speeds.min,
    maxSpeed = speeds.max;
  const sinkLimit = strip.carrier ? 5.5 : near ? 3 : 6;
  const glideTolerance = Math.max(12, distance * 0.025);
  const headingOK = Math.abs(headingError) < 8;
  const trackOK =
    lateral < Math.max(strip.carrier ? 10 : 25, distance * (strip.carrier ? 0.025 : 0.035));
  const glideOK = near || Math.abs(glideError) < glideTolerance;
  const bankOK = Math.abs(a.bank / DEG) < 10;
  const pitchOK = a.pitch / DEG >= -3 && a.pitch / DEG < 15;
  const speedOK = speed >= minSpeed && speed <= maxSpeed;
  const sinkOK = sink >= -0.5 && sink < sinkLimit;
  const flap = flapStatus(s),
    items = [
      { label: 'FUTÓMŰ', value: s.gear ? 'KINN' : 'G: ENGEDD KI', ok: s.gear },
      { label: 'FÉKSZÁRNY', value: s.flaps ? flap.label : 'X: ENGEDD KI', ok: flap.deployed },
      {
        label: 'LÉGFÉK',
        value: s.airbrake ? 'NYITVA' : 'ZÁRVA',
        ok: !s.airbrake || speed > targetSpeed + 15,
      },
      {
        label: 'SEBESSÉG',
        value: `${Math.round(speed)} / ${Math.round(targetSpeed)} KM/H`,
        ok: speedOK,
      },
      { label: 'SÜLLYEDÉS', value: `${sink.toFixed(1)} M/S · <${sinkLimit}`, ok: sinkOK },
      {
        label: 'SIKLÓPÁLYA',
        value: near ? 'SZINTBE VÉTEL' : `${glideError >= 0 ? '+' : ''}${Math.round(glideError)} M`,
        ok: glideOK,
      },
      {
        label: 'PÁLYAIRÁNY',
        value: `${direction > 0 ? '000' : '180'}° · ${Math.round(headingError)}°`,
        ok: headingOK,
      },
      { label: 'TENGELY', value: `${Math.round(s.position.x)} M`, ok: trackOK },
      { label: 'BEDÖNTÉS', value: `${Math.round(a.bank / DEG)}°`, ok: bankOK },
      {
        label: near ? 'ORRHELYZET' : 'BEÉRKEZÉS',
        value: near
          ? `${(a.pitch / DEG).toFixed(1)}°`
          : `${angle.toFixed(1)}° / ${strip.glideDeg || 3}°`,
        ok: near ? pitchOK : angle >= 0.5 && angle < 5,
      },
    ];
  let warning = '';
  if (active) {
    if (
      height < 35 &&
      (sink > (strip.carrier ? 5.5 : 5) || Math.abs(headingError) > 25 || lateral > 100)
    )
      warning = 'ÁTSTARTOLÁS — GÁZ, ORR FEL!';
    else if (!s.gear) warning = 'FUTÓMŰ NINCS KINN — G';
    else if (!flap.deployed)
      warning = flap.jammed
        ? 'FÉKSZÁRNY BESZORULT'
        : s.flaps
          ? 'FÉKSZÁRNY NYÍLIK — VÁRJ'
          : 'FÉKSZÁRNY NINCS KINN — X';
    else if (sink >= sinkLimit) warning = 'TÚL NAGY SÜLLYEDÉS — FINOMAN ORR FEL';
    else if (speed < minSpeed)
      warning = s.airbrake ? 'TÚL LASSÚ — B: FÉK BE, R: GÁZ' : 'TÚL LASSÚ — R: NÖVELD A GÁZT';
    else if (speed > maxSpeed)
      warning =
        s.throttle > 0.02
          ? 'TÚL GYORS — F: GÁZ ALAPJÁRATRA'
          : !s.airbrake
            ? 'TÚL GYORS — B: NYISD A LÉGFÉKET'
            : 'TÚL GYORS — ENYHÉBB SÜLLYEDÉS, VÁRJ A LASSULÁSRA';
    else if (s.airbrake && speed < targetSpeed + 15) warning = 'CÉLSEBESSÉG ELÉRVE — B: LÉGFÉK BE';
    else if (!headingOK)
      warning = `PÁLYAIRÁNY: ${direction > 0 ? '000' : '180'}° — IGAZODJ A PÁLYÁHOZ`;
    else if (!trackOK) warning = 'PÁLYATENGELYTŐL ELTÉRÉS';
    else if (!bankOK) warning = 'TÚL NAGY BEDÖNTÉS';
    else if (!pitchOK) warning = 'HELYTELEN ORRHELYZET';
    else if (!glideOK)
      warning =
        glideError > 0 ? 'SIKLÓPÁLYA FELETT — MAGASAN ÉRKEZEL' : 'SIKLÓPÁLYA ALATT — NÖVELD A GÁZT';
    else if (!near && angle > 5) warning = 'TÚL MEREDEK BEÉRKEZÉS';
  }
  const protectedCorridor =
    active &&
    corridor &&
    lateral < Math.max(40, distance * 0.06) &&
    glideError > -Math.max(15, distance * 0.025) &&
    sink < sinkLimit;
  return {
    active,
    direction,
    distance,
    height,
    sink,
    angle,
    glideError,
    headingError,
    items,
    warning,
    protectedCorridor,
    targetSpeed,
    minSpeed,
    maxSpeed,
    runwayCorridor: active && corridor && distance < 7000 && height < 650,
    stage: near ? (strip.carrier ? 'FEDÉLZETI MEGKÖZELÍTÉS' : 'SZINTBE VÉTEL') : 'MEGKÖZELÍTÉS',
    instruction: strip.carrier
      ? '3,5° siklás, K: horog ki. Tartsd az orrhelyzetet; elvétett kötél után teljes gáz.'
      : near
        ? 'Finoman emeld az orrot; földetérés <3 m/s.'
        : `Tarts ${Math.round(targetSpeed)} km/h-t, kb. 3° süllyedést.`,
    mode: s.landingMode || 'auto',
  };
}

export function touchdownLimits(s) {
  if (navalFlight(s))
    return {
      maxIASKmh: s.spec.vtol && (s.naval?.nozzle || 0) >= 75 ? 43 : 360,
      minIASKmh: s.spec.vtol && (s.naval?.nozzle || 0) >= 75 ? 0 : 130,
      maxSink: s.spec.vtol ? 3 : 5.5,
      maxBankDeg: 12,
      minPitchDeg: -3,
      maxPitchDeg: 18,
      maxHeadingErrorDeg: 12,
      hardSink: 3,
      severeSink: 5.5,
      criticalSink: 8,
    };
  const speeds = approachSpeeds(s);
  return {
    maxIASKmh: Math.max(396, speeds.max),
    minIASKmh: 108,
    maxSink: 3,
    maxBankDeg: 10,
    minPitchDeg: -3,
    maxPitchDeg: 15,
    maxHeadingErrorDeg: Math.asin(0.13) / DEG,
    hardSink: 3,
    severeSink: 5,
    criticalSink: 8,
  };
}
export function touchdownProblems(s, descent, speed) {
  if (navalFlight(s)) return carrierTouchdown(s, descent, speed).problems;
  s = runwayState(s);
  const a = attitude(s.orientation),
    problems = [],
    limits = touchdownLimits(s),
    ias =
      (s.wind?.length() > 0 ? s.velocity.clone().sub(s.wind).length() : speed) *
      Math.sqrt(atmosphere(s.worldAltitude ?? s.position.y).density / 1.225) *
      3.6;
  if (!s.gear) problems.push('A futómű nem volt kiengedve (G).');
  if (!onLandingRunway(s)) problems.push('A földetérés a pályán kívül történt.');
  if (descent >= 3)
    problems.push(`Túl nagy süllyedés: ${descent.toFixed(1)} m/s; 3 m/s alatt szükséges.`);
  if (ias >= limits.maxIASKmh)
    problems.push(
      `Túl nagy sebesség: ${ias.toFixed(0)} km/h IAS; ${limits.maxIASKmh.toFixed(0)} km/h alatt szükséges.`,
    );
  if (ias <= limits.minIASKmh) problems.push('Túl kis sebességgel értél földet.');
  if (Math.abs(a.bank) >= 10 * DEG) problems.push('A bedöntés meghaladta a 10 fokot.');
  if (a.pitch <= -3 * DEG || a.pitch >= 15 * DEG)
    problems.push('Az orrhelyzet nem volt megfelelő (-3 és +15 fok között kell lennie).');
  if (Math.abs(Math.sin(a.heading)) >= 0.13)
    problems.push('A gép nem a pályával párhuzamosan érkezett.');
  return problems;
}

// Contact energy grows with sink speed squared. The old 3 m/s boundary is
// a quality threshold; only catastrophic contacts stop the simulation.
export function assessTouchdown(s, descent, speed) {
  if (s.recoveryExit)
    return {
      fatal: true,
      damage: 100,
      grade: 'crash',
      problems: ['Nincs saját leszállóhely: tengerbe csapódás.'],
    };
  if (navalFlight(s)) return carrierTouchdown(s, descent, speed);
  s = runwayState(s);
  const a = attitude(s.orientation),
    limits = touchdownLimits(s),
    ias =
      (s.wind?.length() > 0 ? s.velocity.clone().sub(s.wind).length() : speed) *
      Math.sqrt(atmosphere(s.worldAltitude ?? s.position.y).density / 1.225) *
      3.6;
  const problems = touchdownProblems(s, descent, speed),
    sink = Math.max(0, descent),
    bank = Math.abs(a.bank / DEG),
    pitch = a.pitch / DEG;
  const track = Math.abs(
    Math.atan2(
      Math.sin(Math.atan2(s.velocity.x, s.velocity.z) - a.heading),
      Math.cos(Math.atan2(s.velocity.x, s.velocity.z) - a.heading),
    ) / DEG,
  );
  const runwayAngle = Math.asin(Math.abs(Math.sin(a.heading))) / DEG;
  const fatal =
    s.dying ||
    (!s.gear && sink >= 5) ||
    runwayAngle >= 35 ||
    !onLandingRunway(s) ||
    sink >= limits.criticalSink ||
    bank >= 25 ||
    pitch <= -12 ||
    pitch >= 25 ||
    ias >= limits.maxIASKmh * 1.3 ||
    track >= 35;
  if (track > 8) problems.push(`Oldalazó földetérés: ${track.toFixed(1)}°.`);
  if (fatal) return { fatal: true, grade: 'crash', damage: 100, problems };
  const energy = Math.max(0, sink * sink - 9),
    gearPenalty = s.gear ? 0 : 25;
  const damage = Math.min(
    75,
    (sink >= 3 ? 0.5 : 0) +
      energy * 1.6 +
      gearPenalty +
      Math.max(0, bank - 10) * 1.4 +
      Math.max(0, -pitch - 3) * 2 +
      Math.max(0, pitch - 15) * 2 +
      Math.max(0, ias - limits.maxIASKmh) * 0.2 +
      Math.max(0, limits.minIASKmh - ias) * 0.12 +
      Math.max(0, track - 8) * 0.7 +
      Math.max(0, runwayAngle - 8) * 0.7,
  );
  return {
    fatal: false,
    grade: damage >= 25 ? 'severe' : damage > 0 ? 'hard' : 'smooth',
    damage,
    problems,
  };
}

// A shoulder is available only after a surviving runway touchdown, not for off-field landing.
export const rolloutLateralTolerance = 120;
export function rolloutMargins(speed) {
  const factor = Math.max(0, Math.min(1, (90 - speed) / 70)) ** 2;
  return {
    lateralTolerance: 8 + (rolloutLateralTolerance - 8) * factor,
    endTolerance: 15 + 285 * factor,
  };
}
export function rolloutSurface(s) {
  if (navalFlight(s)) return { shoulder: false, allowed: onCarrierDeck(s.position, s.airfield) };
  s = runwayState(s);
  const strip = s.airfield || runway,
    margins = rolloutMargins(Math.hypot(s.velocity.x, s.velocity.z)),
    lateral = Math.max(0, Math.abs(s.position.x) - strip.halfWidth),
    longitudinal = Math.max(0, Math.abs(s.position.z) - strip.halfLength);
  const shoulder = !!(
    s.onGround &&
    s.landing?.success &&
    s.gear &&
    !onLandingRunway(s) &&
    (lateral / margins.lateralTolerance) ** 2 + (longitudinal / margins.endTolerance) ** 2 <= 1
  );
  return { ...margins, shoulder, allowed: onLandingRunway(s) || shoulder };
}
export function rolloutObstacle(s, from = s.previousPosition || s.position, to = s.position) {
  if (navalFlight(s)) {
    const p = carrierLocalPosition(s.position, s.airfield);
    return p.y < 52 && p.x > 18 && p.x < 36 && p.z > -15 && p.z < 55
      ? 'A gép az anyahajó felépítményének gurult.'
      : null;
  }
  if (!s.onGround) return null;
  if (s.airfield && !s.airfield.home) return null;
  if (s.airfield) {
    s = runwayState(s);
    from = s.previousPosition;
    to = s.position;
  }
  // A conservative footprint includes the wings while keeping the clear shoulder free.
  const radius = Math.max(5, Math.min(15, Math.sqrt(s.spec.wingArea * 3.5) / 2));
  for (const h of homeHangars) {
    if (Math.min(from.y, to.y) > h.height + 2) continue;
    let enter = 0,
      exit = 1;
    for (const [axis, center, half] of [
      ['x', h.x, h.halfWidth],
      ['z', h.z, h.halfLength],
    ]) {
      const d = to[axis] - from[axis],
        lo = center - half - radius,
        hi = center + half + radius;
      if (Math.abs(d) < 1e-9) {
        if (from[axis] < lo || from[axis] > hi) {
          enter = 2;
          break;
        }
      } else {
        let a = (lo - from[axis]) / d,
          b = (hi - from[axis]) / d;
        if (a > b) [a, b] = [b, a];
        enter = Math.max(enter, a);
        exit = Math.min(exit, b);
      }
    }
    if (enter <= exit && exit >= 0 && enter <= 1) return 'A gép a hangárnak ütközött.';
  }
  return null;
}
