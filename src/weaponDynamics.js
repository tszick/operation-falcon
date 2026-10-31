import { aircraftFlightSpec } from './aiAircraftSpec.js';
import { terrainSightCeiling } from './terrainSight.js';
import { radarContact } from './sensors.js';
import { Vec3, forward, clamp, DEG } from './math.js';
import { armament } from './armament.js';
import { terrainHeight } from './terrain.js';

// SI gameplay approximations. Public references constrain the families, not a
// certified firing envelope. Motor, drag and seeker tuning are documented in README.
const missile = (id, range, mass, thrust, burn, diameter, guidance = 'ir', extra = {}) => ({
  id,
  kind: 'missile',
  maxRange: range,
  minRange: 250,
  mass,
  dryMass: mass * 0.73,
  thrust,
  burn,
  launchSpeed: 35,
  area: Math.PI * (diameter / 2) ** 2,
  cd: 0.3,
  liftArea: diameter * 1.2,
  maxG: 30,
  life: 70,
  minGuideSpeed: 180,
  terminalReserve: 330,
  seeker: 65 * DEG,
  trackRate: 70 * DEG,
  guidance,
  armTime: 0.25,
  armDistance: 120,
  fuseRadius: 7,
  ...extra,
});
const gun = (id, speed, mass, diameter, dispersion, range) => ({
  id,
  kind: 'gun',
  muzzleSpeed: speed,
  mass,
  area: Math.PI * (diameter / 2) ** 2,
  cd: 0.28,
  dispersion,
  effectiveRange: range,
  life: 5,
});
export const weaponProfiles = {
  aim9m: missile('aim9m', 18000, 86, 9500, 3.2, 0.127),
  aim9l: missile('aim9l', 16000, 86, 9000, 3.0, 0.127),
  magic2: missile('magic2', 14000, 89, 10000, 2.8, 0.157, 'ir', { maxG: 35 }),
  r60m: missile('r60m', 10000, 44, 6000, 2.5, 0.12, 'ir', { minRange: 200, maxG: 25, life: 45 }),
  r73: missile('r73', 24000, 105, 12500, 3.7, 0.17, 'ir', { maxG: 40, seeker: 75 * DEG }),
  mica: missile('mica', 55000, 112, 16000, 6, 0.16, 'ir', {
    maxG: 45,
    life: 95,
    minGuideSpeed: 200,
  }),
  aim7e: missile('aim7e', 35000, 197, 20000, 4, 0.203, 'sarh', {
    minRange: 800,
    maxG: 22,
    life: 80,
  }),
  aim7m: missile('aim7m', 65000, 231, 22000, 7, 0.203, 'sarh', { minRange: 600, life: 110 }),
  aim120: missile('aim120', 65000, 152, 19000, 7, 0.178, 'active', {
    minRange: 500,
    maxG: 35,
    life: 110,
    activeRange: 15000,
  }),
  aim120c: missile('aim120c', 85000, 152, 19500, 7.5, 0.178, 'active', {
    minRange: 500,
    maxG: 35,
    life: 120,
    activeRange: 18000,
  }),
  r40: missile('r40', 50000, 475, 42000, 6, 0.31, 'sarh', { minRange: 1000, maxG: 18, life: 100 }),
  r33: missile('r33', 110000, 490, 42000, 10, 0.38, 'sarh', {
    minRange: 1200,
    maxG: 18,
    life: 140,
  }),
  r771: missile('r771', 95000, 190, 23000, 8, 0.2, 'active', {
    minRange: 500,
    maxG: 35,
    life: 125,
    activeRange: 18000,
  }),
  rvvsdm: missile('rvvsdm', 110000, 190, 24000, 8.5, 0.2, 'active', {
    minRange: 500,
    maxG: 40,
    life: 130,
    activeRange: 20000,
  }),
  pl15: missile('pl15', 120000, 210, 25500, 9, 0.2, 'active', {
    minRange: 600,
    maxG: 35,
    life: 140,
    activeRange: 20000,
  }),
  maverick: missile('maverick', 24000, 218, 12000, 4, 0.305, 'imaging', {
    minRange: 700,
    maxG: 12,
    life: 90,
    minGuideSpeed: 110,
    terminalReserve: 180,
    seeker: 55 * DEG,
  }),
  brimstone: missile('brimstone', 22000, 50, 4200, 4, 0.18, 'active', {
    minRange: 500,
    maxG: 15,
    life: 85,
    minGuideSpeed: 100,
    terminalReserve: 180,
    activeRange: 10000,
  }),
  kh29: missile('kh29', 12000, 660, 40000, 4, 0.38, 'laser', {
    minRange: 1000,
    maxG: 10,
    life: 65,
    minGuideSpeed: 110,
    terminalReserve: 180,
  }),
  kh25: missile('kh25', 10000, 300, 20000, 3.5, 0.275, 'laser', {
    minRange: 800,
    maxG: 12,
    life: 60,
    minGuideSpeed: 110,
    terminalReserve: 180,
  }),
  ram: missile('ram', 9000, 73, 9500, 3.5, 0.127, 'ir', {
    minRange: 180,
    life: 35,
    groundLaunchSpeed: 260,
    maxG: 40,
    fuseRadius: 6,
  }),
  seaSparrow: missile('seaSparrow', 9000, 230, 22500, 6, 0.203, 'sarh', {
    minRange: 450,
    life: 45,
    groundLaunchSpeed: 260,
  }),
  sam: missile('sam', 24000, 180, 22500, 6, 0.2, 'active', {
    minRange: 450,
    life: 100,
    activeRange: 12000,
    groundLaunchSpeed: 260,
  }),
  mobileSam: missile('mobileSam', 6000, 12, 1800, 2.5, 0.072, 'ir', {
    minRange: 250,
    life: 25,
    groundLaunchSpeed: 150,
    terminalReserve: 160,
    minGuideSpeed: 100,
    damage: 26,
    maxTargetAltitude: 3500,
    minTargetAltitude: 10,
  }),
  defense: missile('defense', 14000, 90, 10000, 3.4, 0.127),
  m61: gun('m61', 1030, 0.1, 0.02, 0.002, 1400),
  gau22: gun('gau22', 1040, 0.18, 0.025, 0.0018, 1600),
  gau8: gun('gau8', 1010, 0.39, 0.03, 0.0014, 1800),
  gsh30: gun('gsh30', 860, 0.39, 0.03, 0.0022, 1400),
  gsh23: gun('gsh23', 715, 0.175, 0.023, 0.0025, 1100),
  gsh630: gun('gsh630', 850, 0.39, 0.03, 0.0028, 1400),
  defa: gun('defa', 815, 0.275, 0.03, 0.0022, 1300),
  giat: gun('giat', 1025, 0.275, 0.03, 0.0017, 1600),
  bk27: gun('bk27', 1025, 0.26, 0.027, 0.0018, 1600),
  gau12: gun('gau12', 1040, 0.185, 0.025, 0.002, 1600),
  groundGun: gun('groundGun', 950, 0.19, 0.023, 0.003, 1800),
  carrierGun: gun('carrierGun', 950, 0.19, 0.023, 0.003, 1800),
  mk76: { id: 'mk76', kind: 'bomb', mass: 11.34, area: 0.0081, cd: 0.25, life: 150, inert: true },
  mk82: { id: 'mk82', kind: 'bomb', mass: 241, area: 0.059, cd: 0.25, life: 150 },
  fab250: { id: 'fab250', kind: 'bomb', mass: 250, area: 0.083, cd: 0.3, life: 150 },
};
// Keep matching explicit: adding an aircraft preset with an unknown weapon must
// fail validation instead of silently acquiring generic missile performance.
const names = [
  [/Mk 76/, 'mk76'],
  [/AIM-120C/, 'aim120c'],
  [/AIM-120/, 'aim120'],
  [/AIM-9M/, 'aim9m'],
  [/AIM-9L/, 'aim9l'],
  [/AIM-7M/, 'aim7m'],
  [/AIM-7E/, 'aim7e'],
  [/Magic/, 'magic2'],
  [/MICA/, 'mica'],
  [/R-60M/, 'r60m'],
  [/R-73/, 'r73'],
  [/R-40/, 'r40'],
  [/R-33/, 'r33'],
  [/R-77-1/, 'r771'],
  [/RVV-SDM/, 'rvvsdm'],
  [/PL-15/, 'pl15'],
  [/AGM-65/, 'maverick'],
  [/Brimstone/, 'brimstone'],
  [/Kh-29/, 'kh29'],
  [/Kh-25/, 'kh25'],
  [/M61/, 'm61'],
  [/GAU-12/, 'gau12'],
  [/GAU-22/, 'gau22'],
  [/GAU-8/, 'gau8'],
  [/GSh-6-30/, 'gsh630'],
  [/GSh-6-23|Type 23/, 'gsh23'],
  [/GSh-30|9A1/, 'gsh30'],
  [/DEFA/, 'defa'],
  [/30 M 791/, 'giat'],
  [/BK-27/, 'bk27'],
  [/Mk 82/, 'mk82'],
  [/FAB-250/, 'fab250'],
];
export function weaponProfile(spec, type) {
  const name = armament(spec).weapons[type]?.name;
  if (!name) return null;
  const match = names.find(([re]) => re.test(name));
  if (!match) throw new Error(`Missing weapon dynamics: ${name}`);
  return weaponProfiles[match[1]];
}
export function enemyProfile(t, type) {
  if (t.type === 'mobile-sam' && type === 'aam') return weaponProfiles.mobileSam;
  if (['carrier', 'destroyer'].includes(t.type) && type === 'aam') return weaponProfiles.seaSparrow;
  if (t.type === 'carrier' && type === 'gun') return weaponProfiles.carrierGun;
  if (t.type === 'bomber' && type === 'gun')
    return weaponProfiles[aircraftFlightSpec(t.aircraftId || 'tu95').defensiveGun?.profile] || null;
  return t.type === 'fighter'
    ? weaponProfile({ id: t.aircraftId }, type)
    : type === 'gun'
      ? weaponProfiles.groundGun
      : t.kind === 'ground'
        ? weaponProfiles.sam
        : weaponProfiles.defense;
}
export function missileLaunchVelocity(carrier, direction, profile, { ground = false } = {}) {
  return carrier.clone().add(
    direction
      .clone()
      .normalize()
      .scale(
        ground
          ? (profile.groundLaunchSpeed ?? profile.launchSpeed ?? 35)
          : (profile.launchSpeed ?? 35),
      ),
  );
}
export const airDensity = (h) => 1.225 * Math.exp(-Math.max(0, h) / 8500);
export function clearWeaponLine(a, b) {
  const ceiling = terrainSightCeiling(a, b) + 2;
  if (Math.min(a.y, b.y) >= ceiling) return true;
  const dx = b.x - a.x,
    dy = b.y - a.y,
    dz = b.z - a.z,
    distance = Math.hypot(dx, dy, dz),
    steps = Math.min(100, Math.max(6, Math.ceil(distance / 250)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps,
      y = a.y + dy * t;
    if (y >= ceiling) continue;
    if (y < terrainHeight(a.x + dx * t, a.z + dz * t) + 2) return false;
  }
  return true;
}
export function spreadDirection(direction, sigma, rng = Math.random) {
  const angle = 2 * Math.PI * rng(),
    radius = sigma * Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))),
    side = (Math.abs(direction.y) > 0.95 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0))
      .cross(direction)
      .normalize(),
    vertical = direction.cross(side).normalize();
  return direction
    .clone()
    .add(side.scale(Math.cos(angle) * radius))
    .add(vertical.scale(Math.sin(angle) * radius))
    .normalize();
}
export const gunDispersion = (s, p, heat = 0) =>
  p.dispersion *
  (1 + heat * 0.25 + (s.damage || 0) * 0.006 + Math.max(0, Math.abs(s.g || 1) - 1) * 0.1);
export function stepBallistic(p, dt) {
  const profile = p.profile;
  if (!profile) {
    p.velocity.y -= 9.81 * dt;
    return;
  }
  p.velocity.y -= 4.905 * dt;
  const speed = p.velocity.length(),
    k = (0.5 * airDensity(p.position.y) * profile.cd * profile.area) / profile.mass;
  p.velocity.scale(1 / (1 + k * speed * dt));
  p.velocity.y -= 4.905 * dt;
}
export function missileMass(p) {
  return (
    p.profile.mass - (p.profile.mass - p.profile.dryMass) * clamp(p.age / p.profile.burn, 0, 1)
  );
}
function dragAcceleration(profile, speed, height, mass, lateral = 0) {
  const q = 0.5 * airDensity(height) * speed * speed,
    mach = speed / Math.sqrt(1.4 * 287.05 * (288.15 - 0.0065 * clamp(height, 0, 11000))),
    wave = 0.22 * Math.exp(-(((mach - 1.1) / 0.35) ** 2));
  return (
    (q * profile.area * (profile.cd + wave)) / mass +
    (mass * lateral * lateral) / Math.max(1, q * profile.liftArea * 8)
  );
}
export function stepMissile(p, target, launcher, dt) {
  const profile = p.profile || weaponProfiles.aim9m;
  p.profile = profile;
  const speed = p.velocity.length(),
    direction = p.velocity.clone().normalize(),
    mass = missileMass(p),
    authority = clamp((0.5 * airDensity(p.position.y) * speed * speed) / 30000, 0.08, 1),
    limit = Math.min(profile.maxG * 9.81 * authority, speed * profile.trackRate);
  let lateral = new Vec3();
  if (!p.seekerLost && target) {
    const los = target.position.clone().sub(p.position),
      distance = los.length(),
      unit = los.clone().normalize(),
      offAxis = Math.acos(clamp(direction.dot(unit), -1, 1)),
      rel = target.velocity.clone().sub(p.velocity),
      losRate = los.cross(rel).scale(1 / Math.max(1, los.dot(los))),
      closing = Math.max(0, -unit.dot(rel));
    const launchLOS = launcher ? target.position.clone().sub(launcher.position) : null;
    const needsSupport =
      profile.guidance === 'sarh' ||
      profile.guidance === 'laser' ||
      (profile.guidance === 'active' && distance > (profile.activeRange || 15000));
    const support =
      !needsSupport ||
      (!!launcher &&
        !launcher.crashed &&
        !launcher.dying &&
        launcher.alive !== false &&
        (!launcher.orientation ||
          forward(launcher.orientation).dot(launchLOS.clone().normalize()) >
            Math.cos((launcher.spec?.radarCone ?? 60) * DEG)) &&
        launchLOS.length() < (launcher.spec?.radarRange ?? 150000) &&
        radarContact(launcher, target) &&
        clearWeaponLine(launcher.position, target.position));
    if (
      (p.age > 0.15 &&
        (offAxis > profile.seeker ||
          (p.age > profile.burn && speed < profile.minGuideSpeed) ||
          !clearWeaponLine(p.position, target.position))) ||
      (needsSupport && !support)
    ) {
      p.seekerLost = true;
      p.lossReason = needsSupport && !support ? 'TÁMOGATÁS MEGSZŰNT' : 'CÉL ELVESZETT';
    } else {
      lateral = losRate.cross(direction).scale(3.5 * closing);
      // Early pursuit establishes an intercept; later PN avoids chasing the tail.
      if (p.age < 1.5)
        lateral.add(
          unit
            .clone()
            .sub(direction.clone().scale(unit.dot(direction)))
            .scale(speed * 1.2),
        );
      lateral.sub(direction.clone().scale(lateral.dot(direction)));
      if (lateral.length() > limit) lateral.normalize().scale(limit);
    }
  }
  // The steering lift compensates gravity within the same aerodynamic load budget.
  if (!p.seekerLost && target) {
    const gravityNormal = new Vec3(0, 9.81, 0).sub(direction.clone().scale(direction.y * 9.81));
    lateral.add(gravityNormal);
  }
  if (lateral.length() > limit) lateral.normalize().scale(limit);
  const thrust = p.age < profile.burn ? profile.thrust / mass : 0,
    drag = dragAcceleration(profile, speed, p.position.y, mass, lateral.length());
  const along = new Vec3(0, -9.81, 0).dot(direction),
    newSpeed = Math.max(0, speed + (thrust - drag + along) * dt);
  const normalGravity = new Vec3(0, -9.81, 0).sub(direction.clone().scale(-9.81 * direction.y));
  const turn = lateral.add(normalGravity).scale(dt / Math.max(30, speed));
  p.velocity = direction.add(turn).normalize().scale(newSpeed);
  p.travelled = (p.travelled || 0) + newSpeed * dt;
  p.armed = p.age >= profile.armTime && p.travelled >= profile.armDistance;
}
export function predictBombImpact(s) {
  const p = {
    profile: weaponProfile(s.spec, 'bomb'),
    position: s.position.clone().add(new Vec3(0, -0.9, 0)),
    velocity: s.velocity.clone(),
  };
  for (let i = 0; i < 5000; i++) {
    stepBallistic(p, 0.04);
    p.position.add(p.velocity.clone().scale(0.04));
    if (p.position.y <= terrainHeight(p.position.x, p.position.z)) return p.position;
  }
  return p.position;
}

// One-dimensional reachable closure with the same motor/density/drag model.
// It is a launch estimate against constant velocity, not a guaranteed kill zone.
export function missileEnvelope(s, target, profile) {
  const delta = target.position.clone().sub(s.position),
    distance = delta.length(),
    direction = delta.clone().normalize(),
    radial = target.velocity.dot(direction),
    cross = target.velocity.clone().sub(direction.clone().scale(radial)).length();
  let speed = Math.max(
      0,
      missileLaunchVelocity(s.velocity, direction, profile, { ground: !!s.ground }).dot(direction),
    ),
    height = s.position.y,
    travel = 0,
    best = 0,
    time = 0;
  for (let age = 0.25; age <= profile.life; age += 0.25) {
    const slope =
        (direction.y > 0 && height >= target.position.y) ||
        (direction.y < 0 && height <= target.position.y)
          ? 0
          : direction.y,
      mass = profile.mass - (profile.mass - profile.dryMass) * clamp(age / profile.burn, 0, 1),
      acc =
        (age < profile.burn ? profile.thrust / mass : 0) -
        dragAcceleration(
          profile,
          speed,
          height,
          mass,
          9.81 * Math.sqrt(Math.max(0, 1 - slope ** 2)),
        ) -
        9.81 * slope;
    speed = Math.max(0, speed + acc * 0.25);
    if (age > profile.burn && speed < Math.max(profile.minGuideSpeed, profile.terminalReserve))
      break;
    travel += speed * 0.25;
    height = clamp(
      height + speed * slope * 0.25,
      Math.min(s.position.y, target.position.y),
      Math.max(s.position.y, target.position.y),
    );
    const closure = travel - radial * age;
    if (closure > best) {
      best = closure;
      time = age;
    }
  }
  const crossPenalty = 1 / Math.sqrt(1 + (cross / 650) ** 2),
    nominalRange = Math.min(profile.maxRange, Math.max(0, best) * crossPenalty),
    maxRange =
      target.type === 'ballistic'
        ? Math.min(nominalRange, radial < -1500 ? -radial * 1.1 : 0)
        : nominalRange,
    effectiveRange = maxRange * 0.68;
  return {
    distance,
    maxRange,
    effectiveRange,
    minRange: profile.minRange,
    closing: -radial,
    time,
    cross,
  };
}
export const gunEffectiveRange = (source, profile) =>
  profile.effectiveRange * clamp(Math.sqrt(1.225 / airDensity(source.position.y)), 1, 1.5);
export function guidedLaunchStatus(s, target, profile, { envelope = null } = {}) {
  const distance = target.position.distance(s.position),
    direction = target.position.clone().sub(s.position).normalize(),
    offAxis = s.orientation ? Math.acos(clamp(forward(s.orientation).dot(direction), -1, 1)) : 0;
  if (!radarContact(s, target))
    return {
      distance,
      maxRange: Math.min(profile.maxRange, s.spec?.radarRange || 0),
      status: 'radar',
      label: 'CÉL A RADAR LÁTÓMEZEJÉN KÍVÜL',
      detail: 'RADARTÁV ÉS LÁTÓKÚP IS KELL A BEFOGÁSHOZ',
      canLaunch: false,
    };
  const rawReach = envelope || missileEnvelope(s, target, profile),
    reach = {
      ...rawReach,
      maxRange: Math.min(rawReach.maxRange, profile.maxRange, s.spec.radarRange),
      effectiveRange: Math.min(rawReach.effectiveRange, s.spec.radarRange),
    },
    near = distance < profile.minRange,
    far =
      distance > Math.min(profile.maxRange, reach.maxRange) ||
      (profile.maxTargetAltitude !== undefined &&
        ((target.agl ?? target.position.y) > profile.maxTargetAltitude ||
          (target.agl ?? target.position.y) < profile.minTargetAltitude)),
    angle = offAxis > Math.min(profile.seeker, 50 * DEG),
    terrain = !clearWeaponLine(s.position, target.position),
    marginal = distance > reach.effectiveRange;
  const status = near
    ? 'near'
    : far
      ? 'range'
      : angle
        ? 'angle'
        : terrain
          ? 'terrain'
          : marginal
            ? 'marginal'
            : 'good';
  return {
    profile,
    ...reach,
    distance,
    status,
    label: near
      ? 'CÉL TÚL KÖZEL'
      : far
        ? 'LŐTÁVON KÍVÜL'
        : angle
          ? 'INDÍTÁSI SZÖG TÚL NAGY'
          : terrain
            ? 'TEREP TAKARJA A CÉLT'
            : marginal
              ? 'INDÍTHATÓ · HATÁRESET'
              : 'TŰZKÉSZ · KEDVEZŐ',
    detail: `BECSÜLT LŐTÁV ${(profile.minRange / 1000).toFixed(1)}–${(reach.maxRange / 1000).toFixed(1)} KM · ${near ? 'TÚL KÖZEL · NÖVELD A TÁVOLSÁGOT' : far ? 'KÖZELÍTS A LŐTÁVIG' : angle ? 'FORDÍTSD AZ ORROT A CÉL FELÉ' : terrain ? 'EMELKEDJ VAGY KERÜLD MEG A TAKARÁST' : profile.guidance === 'sarh' || profile.guidance === 'laser' ? 'TARTSD A CÉLON' : marginal ? 'KÖZELÍTS A BIZTOSABB HELYZETHEZ' : 'SZÓKÖZ: INDÍTÁS'}`,
    canLaunch: !near && !far && !angle && !terrain,
  };
}
export function gunLead(s, target, profile) {
  const origin =
      s.muzzlePosition?.clone() || s.position.clone().add(forward(s.orientation).scale(15)),
    delta = target.position.clone().sub(origin);
  let time = delta.length() / profile.muzzleSpeed,
    direction = delta.clone().normalize(),
    miss = Infinity;
  for (let iteration = 0; iteration < 7; iteration++) {
    const future = target.position.clone().add(target.velocity.clone().scale(time));
    let p = {
        profile,
        position: origin.clone(),
        velocity: s.velocity.clone().add(direction.clone().scale(profile.muzzleSpeed)),
      },
      elapsed = 0;
    while (elapsed < time && elapsed < profile.life) {
      const dt = Math.min(0.03, time - elapsed);
      stepBallistic(p, dt);
      p.position.add(p.velocity.clone().scale(dt));
      elapsed += dt;
    }
    const error = future.sub(p.position);
    miss = error.length();
    const along = error.dot(direction),
      closing = Math.max(80, p.velocity.clone().sub(target.velocity).dot(direction));
    time = clamp(time + along / closing, 0.015, profile.life + 0.5);
    direction
      .add(
        error
          .sub(direction.clone().scale(along))
          .scale(1 / Math.max(1, profile.muzzleSpeed * elapsed)),
      )
      .normalize();
  }
  return {
    time,
    direction,
    point: origin.clone().add(direction.clone().scale(delta.length())),
    miss,
    reachable: time < profile.life && miss < 15,
  };
}
export function fireSolution(s, target, type, { heat = 0 } = {}) {
  const profile = weaponProfile(s.spec, type);
  if (!profile) return null;
  if (
    s.crashed ||
    s.dying ||
    (['aam', 'agm'].includes(type) && (s.condition?.parts.weapons ?? 1) <= 0.35)
  )
    return {
      profile,
      status: 'disabled',
      label: 'FEGYVERRENDSZER NEM ÜZEMKÉPES',
      detail: 'RAKÉTAINDÍTÁS TILTVA · TÉRJ HAZA',
      canLaunch: false,
    };
  if (!target)
    return {
      profile,
      status: 'no-target',
      label: 'VÁLASSZ CÉLT',
      detail:
        type === 'bomb'
          ? 'BALLISZTIKUS / CCIP'
          : `${type === 'gun' ? 'IRÁNYADÓ LŐTÁV' : 'NÉVLEGES FELSŐ HATÁR'} ${(type === 'gun' ? profile.effectiveRange : profile.maxRange) / 1000} KM`,
      canLaunch: false,
    };
  const distance = target.position.distance(s.position),
    nose = forward(s.orientation);
  if (
    (type === 'aam' && target.kind !== 'air') ||
    (['agm', 'bomb'].includes(type) && target.kind !== 'ground')
  )
    return {
      profile,
      distance,
      status: 'wrong-type',
      label: 'VÁLTS FEGYVERT',
      detail: 'NEM EHHEZ A CÉLHOZ VALÓ',
      canLaunch: false,
    };
  if (type === 'bomb') {
    const impact = predictBombImpact(s),
      error = impact.distance(target.position),
      onTarget = error < Math.max(35, target.radius || 35);
    return {
      profile,
      distance,
      status: onTarget ? 'good' : 'aim',
      label: onTarget ? 'CCIP A CÉLON' : 'IGAZÍTSD A CCIP-JELET',
      detail: `BECSAPÓDÁSI ELTÉRÉS ${Math.round(error)} M`,
      canLaunch: true,
      impact,
    };
  }
  if (type === 'gun') {
    const k = (0.5 * airDensity(s.position.y) * profile.cd * profile.area) / profile.mass,
      sigma = gunDispersion(s, profile, heat),
      energy = Math.exp(-2 * k * distance),
      effectiveRange = gunEffectiveRange(s, profile),
      lead = gunLead(s, target, profile),
      aimAngle = Math.acos(clamp(nose.dot(lead.direction), -1, 1)),
      inRange = distance <= effectiveRange && lead.reachable,
      aimed = aimAngle < 0.012;
    const status = !inRange ? 'range' : !aimed ? 'aim' : energy < 0.35 ? 'marginal' : 'good';
    return {
      profile,
      distance,
      effectiveRange,
      maxRange: effectiveRange,
      minRange: 0,
      energy,
      spreadRadius: 1.794 * sigma * distance,
      time: lead.time,
      lead,
      status,
      label: !inRange
        ? 'GÉPÁGYÚHOZ TÁVOL'
        : !aimed
          ? 'IGAZÍTS AZ ELŐRETARTÁSRA'
          : status === 'good'
            ? 'TŰZKÉSZ · KEDVEZŐ'
            : 'TŰZKÉSZ · GYENGÜLŐ LÖVEDÉK',
      detail: `HATÁSOS ~${(effectiveRange / 1000).toFixed(1)} KM · SZÓRÁSKÖR R≈${(1.794 * sigma * distance).toFixed(1)} M`,
      canLaunch: true,
    };
  }
  return guidedLaunchStatus(s, target, profile);
}
