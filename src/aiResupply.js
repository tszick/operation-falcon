import { airfieldForTarget } from './recoveryAirfields.js';
import { initialiseNaval, requestCatapult } from './navalOps.js';
import { Vec3, Quat, attitude, clamp, DEG } from './math.js';
import { createAircraft } from './physics.js';
import { aircraftFlightSpec } from './aiAircraftSpec.js';
import { mass, atmosphere, approachSpeeds } from './performance.js';
import { damageResponse } from './damage.js';
import { teamOf } from './unitTypes.js';
import { terrainHeight, runway } from './terrain.js';
import { beginRetreat, evasionFlightInput } from './aiDefense.js';
export const aiServiceSeconds = 60;
const terminal = (p, w) => p.dying || p.crashed || w.missionEnded;
function flightFor(t, u) {
  if (t.flight) return t.flight;
  const s = createAircraft(aircraftFlightSpec(t.aircraftId)),
    v = t.velocity.length(),
    air = atmosphere(t.position.y);
  s.position = t.position.clone();
  s.previousPosition = s.position.clone();
  s.velocity = t.velocity.clone();
  s.onGround = false;
  s.airborne = true;
  s.gear = false;
  s.flaps = false;
  s.flapPosition = 0;
  s.throttle = 0.65;
  s.fuel = s.spec.fuelCapacity * 0.5;
  s.ammo = { gun: u.rounds, aam: u.missiles, agm: u.agm, bomb: u.bombs };
  const q = 0.5 * air.density * v * v,
    alpha = clamp(
      ((mass(s) * 9.81) / Math.max(1, q * s.spec.wingArea) - (s.spec.liftZero ?? 0.22)) /
        s.spec.clSlope,
      s.spec.liftZero ? -0.12 : 0,
      0.15,
    );
  s.orientation = Quat.euler(
    t.heading || 0,
    Math.atan2(t.velocity.y, Math.hypot(t.velocity.x, t.velocity.z)) + alpha,
    t.bank || 0,
  );
  t.flight = s;
  return s;
}
function emit(w, t, type, extra = {}) {
  w.emit({
    type,
    sourceId: t.id,
    owner: t.team,
    reason: t.service?.reason,
    homeId: t.service?.homeId,
    ...extra,
  });
}
function startOffmap(t, targets, p, w) {
  beginRetreat(t, targets, p, w);
  t.retreat.reason = 'resupply';
  t.service.stage = 'outbound';
}
export function updateAIResupply(p, targets, w, combat, dt) {
  if (terminal(p, w)) return;
  for (const t of targets) {
    if (
      t.kind !== 'air' ||
      !['fighter', 'bomber'].includes(t.type) ||
      !t.alive ||
      t.pending ||
      t.playerControlled ||
      t.flight?.dying ||
      t.flight?.crashed
    )
      continue;
    const u = combat.unit(t),
      damage = t.flight && (t.flight.damage >= 40 || t.flight.condition.parts.weapons <= 0.35),
      bases = targets.filter(
        (a) =>
          (a.type === 'airbase' ||
            (a.type === 'carrier' &&
              (t.flight?.spec || aircraftFlightSpec(t.aircraftId)).carrierCapable) ||
            (a.type === 'carrier' && t.aircraftId === 'fa18')) &&
          a.alive &&
          teamOf(a, p) === teamOf(t, p),
      ),
      home = bases.sort(
        (a, b) => a.position.distance(t.position) - b.position.distance(t.position),
      )[0];
    if (damage && !home) {
      if (t.service) {
        delete t.service;
        delete t.retreat;
        beginRetreat(t, targets, p, w);
      }
      continue;
    }
    if (!t.service) {
      if (t.retreat) continue;
      const empty =
        t.type === 'bomber'
          ? u.initialBombs > 0 && u.bombs === 0
          : t.lastAIWeapon === 'agm'
            ? u.initialAgm > 0 && u.agm === 0
            : t.lastAIWeapon === 'bomb'
              ? u.initialBombs > 0 && u.bombs === 0
              : u.initialMissiles > 0 && u.missiles === 0;
      const lowFuel = t.flight && t.flight.fuel < t.flight.spec.fuelCapacity * 0.12;
      if (t.physicalRecovery && !home && (empty || lowFuel)) {
        flightFor(t, u);
        beginRetreat(t, targets, p, w);
        continue;
      }
      if (!(damage && home) && !empty && !lowFuel) continue;
      if (
        !damage &&
        w.projectiles.some(
          (a) =>
            a.sourceId === t.id &&
            !a.seekerLost &&
            a.decoyId === undefined &&
            ['sarh', 'laser', 'active'].includes(a.profile?.guidance),
        )
      )
        continue;
      flightFor(t, u);
      t.service = {
        reason: damage ? 'repair' : lowFuel ? 'fuel' : 'ammunition',
        homeId: home?.id || null,
        stage: home ? 'holding' : 'outbound',
        remaining: aiServiceSeconds,
        previousRole: t.aiRole,
        previousTarget: t.aiTargetId,
        sorties: t.serviceCount || 0,
      };
      delete t.coordinatedFlight;
      delete t.groundAttack;
      delete t.evasion;
      t.aiRole = 'resupply';
      t.aiTargetId = null;
      if (home?.type === 'carrier') {
        t.flight.airfield = airfieldForTarget(home);
        t.flight.naval = { nozzle: 0, hook: true, arrested: false };
      } else if (home) {
        t.flight.airfield = {
          position: home.position.clone(),
          elevation: terrainHeight(home.position.x, home.position.z),
          heading: home.heading || 0,
          halfLength: runway.halfLength,
          halfWidth: runway.halfWidth,
          home: !!home.home,
        };
      } else startOffmap(t, targets, p, w);
      emit(w, t, 'ai-service-request');
    }
    const service = t.service;
    if (!service) continue;
    if (service.homeId && !targets.some((a) => a.id === service.homeId && a.alive)) {
      if (t.flight.onGround) {
        emit(w, t, 'ai-service-cancelled', { cause: 'airfield-destroyed' });
        delete t.service;
        t.retired = true;
        t.exited = true;
        t.alive = false;
        continue;
      }
      const alternative = bases.find((a) => a.id !== service.homeId);
      if (alternative) {
        service.homeId = alternative.id;
        service.stage = 'holding';
        t.flight.airfield = airfieldForTarget(alternative);
        if (alternative.type === 'carrier')
          t.flight.naval ??= { nozzle: 0, hook: true, arrested: false };
        emit(w, t, 'ai-service-rerouted');
        continue;
      }
      if (t.physicalRecovery) {
        delete t.service;
        delete t.retreat;
        beginRetreat(t, targets, p, w);
        continue;
      }
      service.homeId = null;
      delete t.flight.airfield;
      if (damage) {
        delete t.service;
        beginRetreat(t, targets, p, w);
        continue;
      }
      startOffmap(t, targets, p, w);
    }
    if (service.stage === 'holding') {
      const busy = targets.some(
        (a) =>
          a !== t &&
          a.service?.homeId === service.homeId &&
          !['holding', 'outbound'].includes(a.service.stage) &&
          a.alive,
      );
      if (!busy) {
        service.stage = 'align';
        emit(w, t, 'ai-approach');
      }
    }
    if (service.stage === 'outbound' && t.retreat?.stage === 'departed') {
      t.exited = true;
      t.alive = true;
      t.retired = false;
      service.stage = 'servicing';
      emit(w, t, 'ai-service-start', { offmap: true });
    }
    if (
      service.stage === 'rollout' &&
      t.flight.onGround &&
      t.flight.landing?.success &&
      t.velocity.length() < 0.5
    ) {
      service.stage = 'servicing';
      emit(w, t, 'ai-service-start', { offmap: false });
    }
    if (service.stage === 'servicing') {
      service.remaining -= dt;
      if (service.remaining > 0) continue;
      const old = t.flight,
        s = createAircraft(old.spec),
        position = old.position.clone(),
        orientation = old.orientation;
      t.flight = s;
      t.defense = s;
      s.ammo = {
        gun: u.initialRounds,
        aam: u.initialMissiles,
        agm: u.initialAgm,
        bomb: u.initialBombs,
      };
      s.position = position;
      s.previousPosition = position.clone();
      s.orientation = orientation;
      s.airfield = old.airfield;
      Object.assign(u, {
        rounds: u.initialRounds,
        missiles: u.initialMissiles,
        agm: u.initialAgm,
        bombs: u.initialBombs,
        missile: 2,
        gun: 1,
        bomb: 0,
        lock: 0,
        envelope: null,
        choiceId: null,
        choiceUntil: 0,
      });
      t.damage = 0;
      delete t.retreat;
      delete t.lastAIWeapon;
      delete t.groundAttack;
      t.serviceCount = (t.serviceCount || 0) + 1;
      if (s.airfield?.carrier) {
        initialiseNaval(s);
        service.stage = 'takeoff';
        t.position = s.position.clone();
        t.velocity = s.velocity.clone();
      } else if (service.homeId) {
        service.stage = 'taxi';
        service.taxiLeg = 0;
        s.gear = true;
        s.flaps = true;
        s.flapPosition = 1;
        s.onGround = true;
        s.airborne = false;
      } else {
        service.stage = 'inbound';
        s.onGround = false;
        s.airborne = true;
        s.gear = false;
        s.flaps = false;
        s.flapPosition = 0;
        s.position.y = Math.max(1800, terrainHeight(position.x, position.z) + 800);
        s.velocity = old.velocity
          .clone()
          .normalize()
          .scale(-(t.cruiseSpeed || 165));
        s.orientation = Quat.euler(Math.atan2(s.velocity.x, s.velocity.z), 0.05, 0);
        t.position = s.position.clone();
        t.velocity = s.velocity.clone();
        t.exited = false;
      }
      emit(w, t, 'ai-service-complete');
    }
    if (
      service.stage === 'inbound' ||
      (service.stage === 'takeoff' &&
        t.flight.position.y - (t.flight.airfield?.elevation || 0) > 700)
    ) {
      t.aiRole = service.previousRole === 'takeoff' ? 'interceptor' : service.previousRole;
      t.aiTargetId = service.previousTarget;
      t.exited = false;
      delete t.service;
      emit(w, t, 'ai-return-to-combat');
    }
  }
}
function control(s, goal, { speed = 160, vertical = null, bankLimit = 25 } = {}) {
  const a = attitude(s.orientation),
    v = Math.max(40, s.velocity.length()),
    air = atmosphere(s.position.y),
    q = 0.5 * air.density * v * v,
    r = damageResponse(s),
    cl =
      (mass(s) * 9.81) /
      Math.max(1, q * s.spec.wingArea * r.lift * Math.max(0.6, Math.cos(a.bank))),
    alpha = clamp(
      (cl - (s.spec.liftZero ?? 0.22) - (s.flapPosition || 0) * 0.45) / s.spec.clSlope,
      -0.1,
      s.spec.stallAlpha * 0.8,
    ),
    h = Math.atan2(goal.x - s.position.x, goal.z - s.position.z),
    error = Math.atan2(Math.sin(h - a.heading), Math.cos(h - a.heading)),
    bank = clamp(error * 0.9, -bankLimit * DEG, bankLimit * DEG),
    vy = vertical ?? clamp((goal.y - s.position.y) * 0.06, -15, 20),
    pitch = alpha + Math.atan2(vy, v),
    rates = s.condition.rates,
    authority = clamp(q / 2800, 0.06, 1),
    available = s.spec.thrust * clamp(air.density / 1.225, 0.23, 1) * r.engine * 0.9,
    drag =
      s.forces?.dragN ||
      q *
        s.spec.wingArea *
        (s.spec.cd0 +
          s.spec.inducedDrag * cl * cl +
          (s.gear ? 0.024 : 0) +
          (s.flapPosition || 0) * 0.035),
    desired = clamp(
      (drag + (mass(s) * 9.81 * vy) / v) / Math.max(1, available) + (speed - v) * 0.035,
      0,
      1,
    );
  return {
    pitch: clamp(
      (pitch - a.pitch) * 2.7 -
        (rates.pitch || 0) / Math.max(0.01, s.spec.pitchRate * DEG * authority * r.pitchControl),
      -0.6,
      0.6,
    ),
    roll: clamp(
      (bank - a.bank) * 2.5 -
        (rates.roll || 0) / Math.max(0.01, s.spec.rollRate * DEG * authority * r.rollControl),
      -0.65,
      0.65,
    ),
    yaw: clamp(-(rates.yaw || 0) / Math.max(0.005, 0.07 * r.control), -1, 1),
    throttle: clamp((desired - s.throttle) * 4, -1, 1),
  };
}
export function aiServiceInput(t) {
  const s = t.flight,
    a = t.service,
    f = s.airfield;
  if (t.evasion && !s.onGround) return evasionFlightInput(t);
  if (!f) return {};
  const rotation = Quat.euler(f.heading, 0, 0),
    inverse = Quat.euler(-f.heading, 0, 0),
    local = inverse.rotate(s.position.clone().sub(f.position)),
    a0 = attitude(s.orientation),
    world = (x, y, z) =>
      rotation.rotate(new Vec3(x, y, z)).add(new Vec3(f.position.x, f.elevation, f.position.z));
  if (f.carrier) local.y -= f.elevation;
  s.afterburner = false;
  if (a.stage === 'servicing') return { throttle: -1, brake: true };
  if (a.stage === 'takeoff') {
    if (f.carrier && s.onGround && s.throttle > 0.9 && !s.naval.catapult) requestCatapult(s);
    s.gear = true;
    s.flaps = true;
    if (!s.onGround && local.y > 100) {
      s.gear = false;
      s.flaps = false;
    }
    const c = control(s, world(0, 1000, f.halfLength + 8000), {
      speed: 180,
      vertical: s.onGround ? 0 : 18,
      bankLimit: 10,
    });
    c.throttle = 1;
    if (s.onGround) c.pitch = s.speed > s.spec.approachSpeed * 1.08 && a0.pitch < 0.15 ? 0.12 : 0;
    return c;
  }
  if (a.stage === 'rollout') {
    return {
      throttle: -1,
      brake: true,
      pitch: clamp(-a0.pitch * 2, -0.2, 0.2),
      yaw: clamp(-local.x * 0.03, -1, 1),
    };
  }
  if (a.stage === 'holding') {
    s.gear = false;
    s.flaps = false;
    const angle = Math.atan2(local.x, local.z) + 0.7;
    return control(s, world(Math.sin(angle) * 7000, 1500, Math.cos(angle) * 7000), { speed: 180 });
  }
  if (a.stage === 'align') {
    s.gear = false;
    s.flaps = false;
    s.airbrake = s.speed > 185;
    const goal = world(0, 750, -f.halfLength - 12000);
    if (s.position.distance(goal) < 900) a.stage = 'final';
    return control(s, goal, { speed: 160 });
  }
  s.landingMode = 'on';
  if (f.carrier) s.naval.hook = true;
  s.gear = true;
  s.flaps = true;
  const target = approachSpeeds(s).target / 3.6,
    v = target / Math.sqrt(atmosphere(s.position.y).density / 1.225),
    d = -(f.touchdownOffset ?? f.halfLength) + (f.carrier ? 0 : 500) - local.z,
    desired = Math.max(0, d * Math.tan((f.glideDeg || 3) * DEG)),
    vy = f.carrier
      ? clamp(-v * 0.061 + (desired - local.y) * 0.2, -5, 3)
      : local.y < 15
        ? -1 + clamp((2 - local.y) * 0.03, -0.5, 0.1)
        : clamp(-s.velocity.length() * 0.052 + (desired - local.y) * 0.3, -10, 4);
  s.airbrake = s.ias > target + 14;
  if (s.onGround && s.landing?.success) {
    a.stage = 'rollout';
    return { throttle: -1, brake: true };
  }
  if (
    local.z > (f.carrier ? 80 : f.halfLength - 300) ||
    (local.y < 80 && (Math.abs(local.x) > 70 || Math.abs(a0.bank) > 15 * DEG))
  ) {
    a.stage = 'align';
    s.gear = false;
    s.flaps = false;
    return control(s, world(0, 1000, f.halfLength + 5000), { speed: 180, vertical: 18 });
  }
  return control(s, world(0, desired, local.z + Math.max(700, Math.min(2000, d + 500))), {
    speed: v,
    bankLimit: local.y < 80 ? 8 : 20,
    vertical: vy,
  });
}

export function moveServiceTaxi(t, dt) {
  if (t.service?.stage !== 'taxi' || !t.flight) return false;
  const s = t.flight,
    f = s.airfield,
    rotation = Quat.euler(f.heading, 0, 0),
    local = Quat.euler(-f.heading, 0, 0).rotate(s.position.clone().sub(f.position)),
    points = [
      new Vec3(-110, 2, local.z),
      new Vec3(-110, 2, -f.halfLength + 180),
      new Vec3(0, 2, -f.halfLength + 180),
    ],
    goal = rotation
      .rotate(points[t.service.taxiLeg])
      .add(new Vec3(f.position.x, f.elevation, f.position.z));
  const a = attitude(s.orientation),
    heading = Math.atan2(goal.x - s.position.x, goal.z - s.position.z),
    error = Math.atan2(Math.sin(heading - a.heading), Math.cos(heading - a.heading)),
    turn = clamp(error, -0.3 * dt, 0.3 * dt),
    h = a.heading + turn,
    speed = Math.abs(error) > 1 ? 3 : 8;
  s.previousPosition = s.position.clone();
  s.velocity = new Vec3(Math.sin(h) * speed, 0, Math.cos(h) * speed);
  s.position.add(s.velocity.clone().scale(dt));
  s.position.y = f.elevation + 2;
  s.orientation = Quat.euler(h, 0, 0);
  s.onGround = true;
  s.elapsed += dt;
  if (s.position.distance(goal) < 15) {
    t.service.taxiLeg++;
    if (t.service.taxiLeg >= 3) {
      t.service.stage = 'takeoff';
      s.orientation = Quat.euler(f.heading, 0, 0);
      s.velocity = new Vec3();
    }
  }
  t.previousPosition = t.position.clone();
  t.position = s.position.clone();
  t.velocity = s.velocity.clone();
  t.heading = h;
  return true;
}
