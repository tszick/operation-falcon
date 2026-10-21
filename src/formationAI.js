import { Vec3, clamp, DEG } from './math.js';
import { aircraftFlightSpec } from './aiAircraftSpec.js';
import { loadout } from './aircraftSpec.js';
import { atmosphere, mass } from './performance.js';
import { terrainHeight } from './terrain.js';
import { radarContact } from './sensors.js';
import { combatSource } from './unitCombat.js';
import { teamOf } from './unitTypes.js';

const available = (t) =>
  t.alive !== false &&
  !t.pending &&
  !t.service &&
  !t.retreat &&
  !t.falling &&
  !t.crashed &&
  !t.dying &&
  !t.flight?.dying &&
  !t.flight?.crashed &&
  (!t.exited || t.playerControlled);
const squadKey = (t, player) => teamOf(t, player) + ':' + t.radioCallSign.flight;
export function formationContext(player, targets) {
  const units = new Map(targets.map((t) => [t.id, t])),
    squads = new Map();
  const members = [
    ...targets.filter((t) => !t.playerControlled),
    ...(player.radioCallSign && !player.crashed && !player.dying ? [player] : []),
  ];
  for (const t of members) {
    if (!t.radioCallSign || !available(t) || t.kind === 'ground') continue;
    const key = squadKey(t, player),
      list = squads.get(key) || [];
    list.push(t);
    squads.set(key, list);
  }
  const leaders = new Map();
  for (const [key, list] of squads) {
    list.sort((a, b) => a.radioCallSign.number - b.radioCallSign.number);
    leaders.set(key, list[0]);
  }
  return { units, leaders, player };
}
export function navigationLimits(t) {
  const spec = t.flight?.spec || aircraftFlightSpec(t.aircraftId),
    air = atmosphere(t.position.y);
  t.navigationReferenceMass ??= mass({ spec, fuel: spec.fuelCapacity * 0.5, ammo: loadout(spec) });
  const weight = t.flight?.ammo ? mass(t.flight) : t.navigationReferenceMass;
  return {
    spec,
    air,
    mass: weight,
    minSpeed: Math.max(
      spec.approachSpeed * 1.25,
      1.3 * Math.sqrt((2 * weight * 9.81) / (air.density * spec.wingArea * spec.maxCL)),
    ),
    maxSpeed: spec.maxMach * air.soundSpeed,
  };
}
export function coordinatedFlightPlan(t, target, context) {
  if (
    t.kind !== 'air' ||
    !['fighter', 'bomber'].includes(t.type) ||
    !available(t) ||
    t.aiRole === 'takeoff'
  )
    return null;
  const protectedUnit = t.defendId ? context.units.get(t.defendId) : null,
    escort = t.type === 'fighter' && protectedUnit?.kind === 'air' && available(protectedUnit);
  const leader = escort
    ? protectedUnit
    : t.radioCallSign
      ? context.leaders.get(squadKey(t, context.player))
      : null;
  if (!leader || leader === t) return null;
  const limits = navigationLimits(t),
    p = leader.position,
    v = leader.velocity,
    leaderSpeed = Math.hypot(v.x, v.z),
    heading = leaderSpeed > 10 ? Math.atan2(v.x, v.z) : leader.heading || 0,
    nose = new Vec3(Math.sin(heading), 0, Math.cos(heading)),
    side = new Vec3(nose.z, 0, -nose.x);
  const separation = Math.hypot(t.position.x - p.x, t.position.z - p.z),
    threatRange = target ? Math.hypot(target.position.x - p.x, target.position.z - p.z) : Infinity,
    targetRange = target ? t.position.distance(target.position) : Infinity;
  const previousCombat = ['combat', 'intercept'].includes(t.coordinatedFlight?.mode),
    isAir = target && (target.kind === 'air' || target === context.player);
  const threat =
    isAir &&
    !target.retreat &&
    (threatRange < (previousCombat ? 24000 : 18000) ||
      (target.aiTargetId === leader.id && threatRange < 24000));
  const engage =
    !!target &&
    available(target) &&
    radarContact(combatSource(t, context.player), target) &&
    (escort
      ? threat && (separation < 7000 || threatRange < 6000)
      : !target.retreat &&
        targetRange < (target.kind === 'ground' ? 10000 : previousCombat ? 30000 : 24000));
  // Bombers keep their assigned bombing run once within attack distance.
  if (engage && t.type === 'bomber') return null;
  let mode = engage
    ? escort
      ? 'intercept'
      : 'combat'
    : separation > 7000
      ? 'rejoin'
      : 'formation';
  const number = t.radioCallSign?.number || 2,
    lateral = escort
      ? number % 2
        ? -800
        : 800
      : (number % 2 ? 550 : -550) * Math.ceil((number - 1) / 2),
    trail = escort ? 1000 : -450 * Math.max(1, number - 1);
  let position = p.clone().add(nose.clone().scale(trail)).add(side.scale(lateral));
  position.y = Math.max(p.y + (escort ? 200 : 100), terrainHeight(position.x, position.z) + 350);
  let desired;
  if (engage) {
    const lead = Math.min(4, targetRange / 1000);
    position = target.position.clone().add(target.velocity.clone().scale(lead));
    position.y = Math.max(position.y, terrainHeight(position.x, position.z) + 350);
    desired = Math.max(
      t.cruiseSpeed || 165,
      leaderSpeed + 40,
      Math.hypot(target.velocity.x, target.velocity.z) + 60,
    );
  } else if (leaderSpeed < limits.minSpeed * 0.85) {
    mode = 'cover-orbit';
    const angle = Math.atan2(t.position.x - p.x, t.position.z - p.z) + 0.65;
    position = new Vec3(
      p.x + Math.sin(angle) * 2500,
      Math.max(p.y + 650, terrainHeight(p.x, p.z) + 800),
      p.z + Math.cos(angle) * 2500,
    );
    desired = limits.minSpeed * 1.15;
  } else {
    const along = position.clone().sub(t.position).dot(nose);
    desired = leaderSpeed + clamp(along * 0.06, -70, 180);
  }
  const targetSpeed = clamp(desired, limits.minSpeed, limits.maxSpeed),
    afterburner =
      !!limits.spec.hasAB &&
      targetSpeed > Math.hypot(t.velocity.x, t.velocity.z) + 35 &&
      separation > 1500;
  return {
    role: escort ? 'escort' : 'squad',
    leaderId: leader.id || 'PLAYER',
    mode,
    position,
    targetSpeed,
    minSpeed: limits.minSpeed,
    maxSpeed: limits.maxSpeed,
    afterburner,
    bankLimit: (engage ? 50 : 40) * DEG,
  };
}
export function steerCoordinatedFlight(t, plan, dt) {
  if (!plan || t.flight || t.evasion || t.retreat || dt <= 0) return;
  const limits = navigationLimits(t),
    speed = Math.max(1, Math.hypot(t.velocity.x, t.velocity.z)),
    desiredHeading = Math.atan2(plan.position.x - t.position.x, plan.position.z - t.position.z),
    error = Math.atan2(
      Math.sin(desiredHeading - (t.heading || 0)),
      Math.cos(desiredHeading - (t.heading || 0)),
    ),
    rate = Math.min(0.12, (9.81 * Math.tan(plan.bankLimit)) / Math.max(70, speed)),
    turn = clamp(error, -rate * dt, rate * dt);
  t.heading = (t.heading || 0) + turn;
  t.bank = Math.atan((speed * turn) / (dt * 9.81));
  const q = 0.5 * limits.air.density * speed * speed,
    cl =
      (limits.mass * 9.81) /
      Math.max(1, q * limits.spec.wingArea * Math.max(0.5, Math.cos(t.bank))),
    drag = q * limits.spec.wingArea * (limits.spec.cd0 + limits.spec.inducedDrag * cl * cl),
    installed = plan.afterburner ? limits.spec.abThrust : limits.spec.thrust,
    thrust =
      installed *
      clamp(limits.air.density / 1.225, 0.23, 1) *
      clamp(1 - (speed / (limits.spec.maxMach * limits.air.soundSpeed)) * 0.22, 0.4, 1);
  const acceleration = Math.min(6, (thrust - drag) / limits.mass),
    deceleration = Math.min(
      3.5,
      Math.max(0.2, (drag + q * limits.spec.wingArea * 0.06) / limits.mass),
    ),
    next = Math.max(
      1,
      speed +
        clamp(
          plan.targetSpeed - speed,
          Math.min(-deceleration, acceleration) * dt,
          acceleration * dt,
        ),
    );
  const ahead =
      terrainHeight(
        t.position.x + Math.sin(t.heading) * 1800,
        t.position.z + Math.cos(t.heading) * 1800,
      ) + (plan.groundAttack ? 150 : 350),
    vertical =
      plan.verticalSpeed ??
      clamp(
        (Math.max(plan.position.y, ahead) - t.position.y) * 0.035,
        plan.groundAttack ? -60 : -15,
        plan.groundAttack ? 45 : 22,
      );
  t.velocity = new Vec3(Math.sin(t.heading) * next, vertical, Math.cos(t.heading) * next);
  t.pitch = Math.atan2(vertical, next);
  t.afterburner = plan.afterburner;
  t.throttle = plan.targetSpeed > speed ? 1 : 0.5;
}

export function areaDefensePlan(t, target, context) {
  if (t.type !== 'fighter' || !available(t) || t.aiRole === 'takeoff') return null;
  const protectedUnits = t.defendGroup
    ? [...context.units.values()].filter((a) => a[t.defendGroup] && a.alive)
    : [context.units.get(t.defendId)].filter((a) => a?.kind === 'ground' && a.alive);
  if (!protectedUnits.length) return null;
  const center = protectedUnits
      .reduce((v, a) => v.add(a.position), new Vec3())
      .scale(1 / protectedUnits.length),
    separation = Math.hypot(t.position.x - center.x, t.position.z - center.z);
  if (target && !target.retreat && target.position.distance(center) < 35000 && separation < 35000)
    return null;
  const angle = Math.atan2(t.position.x - center.x, t.position.z - center.z) + 0.7,
    position =
      separation > 12000
        ? center.clone()
        : center.clone().add(new Vec3(Math.sin(angle) * 6000, 0, Math.cos(angle) * 6000)),
    limits = navigationLimits(t);
  position.y = Math.max(center.y + 1800, terrainHeight(position.x, position.z) + 1000);
  return {
    role: 'area-defense',
    leaderId: t.defendId || t.defendGroup,
    mode: separation > 12000 ? 'area-return' : 'area-patrol',
    position,
    targetSpeed: clamp(t.cruiseSpeed || 200, limits.minSpeed, limits.maxSpeed),
    minSpeed: limits.minSpeed,
    maxSpeed: limits.maxSpeed,
    afterburner: false,
    bankLimit: 40 * DEG,
  };
}

// A surviving leader without detected targets must not coast beyond the map.
export function idleFlightPlan(t, target, context) {
  if (
    target ||
    t.kind !== 'air' ||
    !['fighter', 'bomber'].includes(t.type) ||
    !available(t) ||
    t.aiRole === 'takeoff'
  )
    return null;
  t.patrolAnchor ??= t.position.clone();
  const bases = [...context.units.values()].filter(
    (a) =>
      a.type === 'airbase' && a.alive && teamOf(a, context.player) === teamOf(t, context.player),
  );
  const base = bases.sort(
      (a, b) => a.position.distance(t.position) - b.position.distance(t.position),
    )[0],
    center = base?.position || t.patrolAnchor;
  const distance = Math.hypot(t.position.x - center.x, t.position.z - center.z),
    angle = Math.atan2(t.position.x - center.x, t.position.z - center.z) + 0.7;
  const position =
      distance > 12000
        ? center.clone()
        : center.clone().add(new Vec3(Math.sin(angle) * 6000, 0, Math.cos(angle) * 6000)),
    limits = navigationLimits(t);
  position.y = Math.max(center.y + 1500, terrainHeight(position.x, position.z) + 800);
  return {
    role: 'patrol',
    leaderId: base?.id || t.id,
    mode: distance > 12000 ? 'patrol-return' : 'patrol-orbit',
    position,
    targetSpeed: clamp(t.cruiseSpeed || 180, limits.minSpeed, limits.maxSpeed),
    minSpeed: limits.minSpeed,
    maxSpeed: limits.maxSpeed,
    afterburner: false,
    bankLimit: 35 * DEG,
  };
}
