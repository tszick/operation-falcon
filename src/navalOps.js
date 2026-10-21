import { Vec3, Quat, DEG, attitude, up, forward, clamp } from './math.js';
import { carrierDeck, carrierAirfield } from './navalData.js';
import { mass, atmosphere } from './performance.js';
export const navalFlight = (s) => !!s.airfield?.carrier;
export function onCarrierDeck(p) {
  return Math.abs(p.x) < carrierDeck.halfWidth && Math.abs(p.z) < carrierDeck.halfLength;
}
export function initialiseNaval(s) {
  s.airfield = carrierAirfield();
  s.naval = { hook: false, nozzle: 0, arrested: false, bolter: false };
  s.position = new Vec3(-7, 22, -115);
  s.previousPosition = s.position.clone();
  s.orientation = new Quat();
  s.agl = 22;
  return s;
}
export function requestCatapult(s) {
  if (!navalFlight(s) || s.spec.vtol || !s.onGround || s.landing?.success)
    return 'KATAPULT NEM ELÉRHETŐ';
  if (s.naval.catapult) return 'KATAPULT INDÍTÁS FOLYAMATBAN';
  if (s.elapsed < 5) return 'VÁRJ: FALCON TWO ELHAGYJA A FEDÉLZETET';
  if (s.throttle < 0.9) return 'KATAPULT: ELŐBB TELJES GÁZ';
  if (Math.abs(s.position.x + 7) > 5 || s.position.z > 0) return 'ÁLLJ A KATAPULT INDÍTÓPONTJÁRA';
  s.naval.catapult = true;
  s.naval.launchStart = s.position.z;
  const pose = attitude(s.orientation);
  s.naval.launchHeading = pose.heading;
  s.naval.launchPitch = pose.pitch;
  s.naval.launchBank = pose.bank;
  return 'KATAPULT INDÍTÁS';
}
export function nozzleThrust(s, thrust, direction = null, normal = null) {
  const angle = s.spec.vtol ? (s.naval?.nozzle || 0) * DEG : 0,
    f = direction ? direction.clone() : forward(s.orientation);
  if (!angle) return f.scale(thrust);
  return f
    .scale(Math.cos(angle) * thrust)
    .add((normal ? normal.clone() : up(s.orientation)).scale(Math.sin(angle) * thrust * 0.96));
}
export function hoverMargin(s) {
  return (s.spec.thrust * Math.exp(-Math.max(0, s.position.y) / 8500) * 0.96) / (mass(s) * 9.81);
}
export function navalControlAuthority(s) {
  return !!s.spec.vtol && (s.naval?.nozzle || 0) >= 45 && s.fuel > 0 && s.throttle > 0.35;
}
export function navalAcceleration(s) {
  return s.naval?.catapult && s.onGround ? new Vec3(0, 0, 40) : new Vec3();
}
export function carrierTouchdown(s, descent, speed) {
  const a = attitude(s.orientation),
    vtol =
      s.spec.vtol && (s.naval?.nozzle || 0) >= 75 && Math.hypot(s.velocity.x, s.velocity.z) < 12;
  const problems = [];
  if (!s.gear) problems.push('A fedélzeti leszálláshoz futómű kell.');
  if (!onCarrierDeck(s.position)) problems.push('A gép nem a fedélzetet érte el.');
  if (descent > 5.5) problems.push('Túl nagy fedélzeti süllyedés.');
  if (Math.abs(a.bank) > 12 * DEG) problems.push('Túl nagy bedöntés a fedélzethez.');
  if (vtol) {
    if (Math.abs(a.pitch) > 12 * DEG)
      problems.push('Túl nagy orrhelyzet a függőleges leszálláshoz.');
    if (descent > 3) problems.push('Függőleges leszállás: legfeljebb 3 m/s süllyedés.');
  } else {
    const q = Quat.euler(-s.airfield.heading, 0, 0),
      p = q.rotate(s.position.clone().sub(s.airfield.position)),
      heading = attitude(q.multiply(s.orientation)).heading,
      ias = speed * Math.sqrt(atmosphere(s.position.y).density / 1.225) * 3.6;
    if (Math.abs(p.x) > 13 || Math.abs(p.z) > 140)
      problems.push('A gép a leszállósávon kívül érkezett.');
    if (Math.abs(heading) > 12 * DEG) problems.push('Nem a ferde fedélzet irányába érkeztél.');
    if (ias < 130 || ias > 360) problems.push('Nem megfelelő fedélzeti megközelítési sebesség.');
    if (a.pitch < -3 * DEG || a.pitch > 18 * DEG) problems.push('Helytelen fedélzeti orrhelyzet.');
  }
  const fatal = problems.length > 0;
  return {
    fatal,
    grade: fatal ? 'crash' : descent > 3 ? 'hard' : 'smooth',
    damage: fatal ? 100 : Math.max(0, descent * descent - 9) * 0.8,
    problems,
  };
}
export function stepNaval(s, dt) {
  if (!navalFlight(s) || s.crashed) return;
  const n = s.naval;
  if (n.arrested) {
    s.onGround = true;
    s.position.y = 22;
    s.velocity.y = 0;
  }
  if (n.bolter && s.agl > 150) n.bolter = false;
  if (n.catapult) {
    // A single small release bob over the first 12 m settles before rotation.
    // Both ends of the pulse have zero slope: no instantaneous camera change.
    const travel = Math.max(0, s.position.z - n.launchStart),
      t = clamp((travel - 14) / 80, 0, 1),
      ease = t * t * (3 - 2 * t),
      pose = attitude(s.orientation),
      start = n.launchPitch ?? 0;
    const releaseBob = travel < 12 ? 2.2 * DEG * Math.sin((Math.PI * travel) / 12) ** 2 : 0,
      target = start + (11 * DEG - start) * ease + releaseBob;
    const pitch = pose.pitch + clamp(target - pose.pitch, -14 * DEG * dt, 14 * DEG * dt);
    s.orientation = Quat.euler(
      n.launchHeading ?? pose.heading,
      pitch,
      (n.launchBank ?? 0) * (1 - ease),
    );
    if (!s.onGround || travel > 125) {
      n.catapult = false;
      if (s.onGround) {
        s.onGround = false;
        s.airborne = true;
        s.velocity.y = Math.max(4, s.velocity.y);
      }
      n.launchComplete = true;
    }
  }
  if (s.spec.vtol && n.nozzle >= 75 && !s.onGround && s.speed < 35) s.stalled = false;
  if (s.onGround && s.landing?.success && !s.spec.vtol) {
    const inv = Quat.euler(-s.airfield.heading, 0, 0),
      p = inv.rotate(s.position.clone().sub(s.airfield.position)),
      prev = inv.rotate((s.previousPosition || s.position).clone().sub(s.airfield.position));
    if (
      n.hook &&
      !n.arrested &&
      Math.abs(p.x) < 13 &&
      [-90, -78, -66, -54].some((z) => prev.z <= z && p.z >= z)
    ) {
      n.arrested = true;
      n.trapSpeed = s.speed;
      n.trapDistance = 0;
      s.throttle = 0;
    }
    if (n.arrested) {
      const v = Math.hypot(s.velocity.x, s.velocity.z),
        decel = Math.min(3 * 9.81, Math.max(8, (n.trapSpeed * n.trapSpeed) / (2 * 75))),
        next = Math.max(0, v - decel * dt);
      if (v > 0) {
        s.velocity.x *= next / v;
        s.velocity.z *= next / v;
      }
      n.trapDistance += next * dt;
      s.speed = s.velocity.length();
      s.ias = s.speed;
    } else if (p.z > 65) {
      n.bolter = true;
      s.onGround = false;
      s.landing = null;
      s.throttle = 1;
      s.velocity.y = Math.max(4, s.velocity.y);
      s.orientation = Quat.euler(s.airfield.heading, 10 * DEG, 0);
      s.warning = 'BOLTER — ÁTSTARTOLÁS, TELJES GÁZ';
    }
  }
  if (s.onGround && !onCarrierDeck(s.position)) {
    s.onGround = false;
    s.airborne = true;
    s.landing = null;
    s.velocity.y = -2;
  }
  if (s.spec.vtol && n.nozzle >= 75 && hoverMargin(s) < 1 && s.throttle > 0.9)
    s.warning = 'TÚL NEHÉZ A LEBEGÉSHEZ — RÖVID FELSZÁLLÁS 45°';
}

export function vtolApproach(s) {
  const height = s.position.y - 20,
    sink = -s.velocity.y,
    near = Math.abs(s.position.x) < 100 && Math.abs(s.position.z) < 230,
    active =
      !s.onGround &&
      !s.dying &&
      !s.crashed &&
      (s.landingMode === 'on' || (s.landingMode !== 'off' && near && height < 150)),
    speed = Math.hypot(s.velocity.x, s.velocity.z);
  let warning = '';
  if (active)
    warning = !s.gear
      ? 'FUTÓMŰ NINCS KINN — G'
      : hoverMargin(s) < 1
        ? 'TÚL NEHÉZ A LEBEGÉSHEZ'
        : sink > 3
          ? 'TÚL NAGY SÜLLYEDÉS — NÖVELD A GÁZT'
          : speed > 12
            ? 'TÚL NAGY OLDALIRÁNYÚ / ELŐREMENŐ SEBESSÉG'
            : '';
  return {
    active,
    direction: 1,
    distance: Math.max(0, Math.hypot(s.position.x, s.position.z) - 100),
    height,
    sink,
    angle: 0,
    glideError: 0,
    headingError: 0,
    protectedCorridor: active && near,
    runwayCorridor: active && near,
    stage: 'FÜGGŐLEGES LESZÁLLÁS',
    targetSpeed: 0,
    minSpeed: 0,
    maxSpeed: 43,
    warning,
    mode: s.landingMode,
    items: [
      { label: 'FÚVÓCSŐ', value: '90°', ok: true },
      { label: 'FUTÓMŰ', value: s.gear ? 'KINN' : 'G: KI', ok: s.gear },
      { label: 'SÜLLYEDÉS', value: sink.toFixed(1) + ' M/S', ok: sink < 3 },
      { label: 'FEDÉLZET', value: height.toFixed(0) + ' M', ok: near },
      { label: 'VÍZSZINTES', value: (speed * 3.6).toFixed(0) + ' KM/H', ok: speed < 12 },
      {
        label: 'LEBEGÉSI TARTALÉK',
        value: Math.round((hoverMargin(s) - 1) * 100) + '%',
        ok: hoverMargin(s) > 1,
      },
    ],
    instruction: 'Z: 90° fúvócső, G: futó ki. Kis döntések, finom gáz; süllyedés <3 m/s.',
  };
}

export function recoveryComplete(s) {
  if (s.recoveryExit)
    return !s.crashed && !s.dying && !s.onGround && s.position.distance(s.recoveryExit) < 2500;

  return !!(
    s.onGround &&
    s.landing?.success &&
    s.speed < 5 &&
    (!navalFlight(s) || (s.spec.vtol ? (s.naval?.nozzle || 0) >= 75 : s.naval?.arrested))
  );
}
