import { attachRoadBridges, destroyRoadBridge } from './bridgeCrossings.js';
import { moveMobileGround } from './mobileGround.js';
import { moveAttackDrone } from './droneOps.js';
import { moveTanker, refuelReceiverInput } from './aerialRefuelling.js';
import { unitAirVelocity, advectNavigatingAircraft } from './flightEnvironment.js';
import { moveOceanShip } from './oceanEnvironment.js';
import { aiServiceInput, moveServiceTaxi } from './aiResupply.js';
import { radarContact } from './sensors.js';
import {
  retreatFlightInput,
  combatFlightInput,
  moveEvasiveAircraft,
  ageEvasion,
  evasionFlightInput,
} from './aiDefense.js';
import { TargetCycle } from './targetCycle.js';
import { moveBallistic } from './ballisticFlight.js';
import { mass, atmosphere } from './performance.js';
import { escortFlightInput } from './battleMovement.js';
import { createBattleTargets } from './scenarioSpawn.js';
import { moveConvoy, moveEscort } from './battleMovement.js';
import { visibleTargets, targetSelectable } from './electronicWarfare.js';
import { firingStatus } from './firingStatus.js';
import { Vec3, Quat, forward, clamp, DEG, attitude } from './math.js';
import {
  terrainHeight,
  configureTerrain,
  terrainWorld,
  pathHeading,
  convoyPose,
} from './terrain.js';
import { jammerMissions, navigationJammed } from './electronicWarfare.js';
import { enemyAircraft } from './enemies.js';
import { weaponAvailable, weaponLabel, weaponKeys } from './armament.js';
import { createAircraft, stepAircraft } from './physics.js';
import { aircraftFlightSpec } from './aiAircraftSpec.js';
import { applyDamage } from './damage.js';
import { updateCivilFlight } from './civilFlight.js';
import { targetSpawn } from './spawning.js';
import { threatsFor } from './threats.js';
import { predictBombImpact } from './weaponDynamics.js';
export function createTargets(m, playerSpec = { faction: 'west' }, { rng = Math.random } = {}) {
  if (m.composition) return createBattleTargets(m, playerSpec, { rng });
  if (m.objective === 'landing' || m.objective === 'flight-test') {
    configureTerrain(m, undefined, rng);
    return attachRoadBridges([]);
  }
  const enemy = enemyAircraft(m, playerSpec),
    spawn = targetSpawn(m, rng);
  configureTerrain(m, spawn.position, rng);
  if (m.kind === 'ground') spawn.position.y = terrainHeight(spawn.position.x, spawn.position.z) + 8;
  if (m.id === 'bridge') {
    spawn.position.y = terrainWorld.river.level + 14;
    spawn.heading = pathHeading(terrainWorld.road, 0);
  }
  const result = [
    {
      id: 'T01',
      name: m.kind === 'air' ? enemy.name : m.name,
      role: m.name,
      kind: m.kind,
      type: m.id,
      threats: threatsFor(m.id),
      civilian: m.objective === 'escort',
      cruiseSpeed: m.speed,
      faction: enemy.faction,
      aircraftId: m.kind === 'air' ? enemy.id : null,
      ...spawn,
      alive: true,
      radius: m.kind === 'air' ? 28 : m.id === 'bridge' ? terrainWorld.river.width * 0.55 : 60,
    },
  ];
  if (m.id === 'convoy') {
    const t = result[0];
    t.routeDistance = 0;
    t.routeDirection = 1;
    Object.assign(t, convoyPose(t));
    t.velocity = new Vec3(Math.sin(t.heading) * 14, 0, Math.cos(t.heading) * 14);
  }
  if (jammerMissions.has(m.id)) {
    const t = result[0],
      angle = rng() * Math.PI * 2;
    t.protectedBy = 'J01';
    const position = t.position
      .clone()
      .add(new Vec3(Math.sin(angle) * 1800, 0, Math.cos(angle) * 1800));
    position.y = terrainHeight(position.x, position.z) + 3;
    result.push({
      id: 'J01',
      name: 'Jelzavaróállomás',
      role: 'Radar / GPS zavaró',
      type: 'jammer',
      kind: 'ground',
      faction: t.faction,
      position,
      velocity: new Vec3(),
      heading: angle,
      alive: true,
      radius: 35,
      jamRadius: 7000,
      threats: [],
    });
  }
  return attachRoadBridges(result);
}
export function applyTargetHit(
  target,
  weapon,
  { part = null, engineIndex = null, amount = null } = {},
) {
  if (['ballistic', 'attack-drone'].includes(target.type)) {
    target.health = Math.max(0, target.health - (amount ?? (weapon === 'gun' ? 18 : 50)));
    target.damage = 100 * (1 - target.health / target.maxHealth);
    if (target.health <= 0) {
      target.alive = false;
      target.intercepted = true;
    }
    return !target.alive;
  }
  if (target.kind !== 'air') {
    if (target.maxHealth) {
      const damage = amount ?? (weapon === 'gun' ? 18 : 100);
      target.health = Math.max(0, target.health - damage);
      target.damage = 100 * (1 - target.health / target.maxHealth);
      if (target.health > 0) return false;
    }
    target.alive = false;
    if (target.type === 'bridge') destroyRoadBridge(target);
    return true;
  }
  if (!target.flight) {
    const spec = aircraftFlightSpec(target.aircraftId || 'mig29');
    target.flight = createAircraft(spec, { ammo: { gun: 0, aam: 0, agm: 0, bomb: 0 } });
    const s = target.flight;
    s.weather = terrainWorld.weather;
    s.noAirfield = !!terrainWorld.noAirfield;
    s.engineSpool = target.navigationEngine?.engineSpool ?? target.throttle ?? 0.65;
    s.elapsed = target.environmentClock || 0;
    s.position = target.position.clone();
    s.velocity = target.velocity.clone();
    s.orientation = Quat.euler(target.heading || Math.atan2(s.velocity.x, s.velocity.z), 0, 0);
    s.onGround = false;
    s.airborne = true;
    s.gear = false;
    s.flaps = false;
    s.flapPosition = 0;
    s.previousPosition = target.position.clone();
    s.throttle = 0.65;
    s.fuel = spec.fuelCapacity * 0.5;
    s.ammo = { gun: 0, aam: 0, agm: 0, bomb: 0 };
    s.landingMode = 'off';
    const air = atmosphere(s.position.y),
      q = 0.5 * air.density * s.velocity.length() ** 2,
      alpha = clamp(
        ((mass(s) * 9.81) / Math.max(1, q * spec.wingArea) - (spec.liftZero ?? 0.22)) /
          spec.clSlope,
        0,
        spec.stallAlpha * 0.8,
      );
    s.orientation = Quat.euler(
      target.heading || 0,
      Math.atan2(s.velocity.y, Math.hypot(s.velocity.x, s.velocity.z)) + alpha,
      target.bank || 0,
    );
  }
  applyDamage(target.flight, amount ?? (weapon === 'gun' ? 18 : 100), {
    part,
    engineIndex,
    source: weapon === 'gun' ? 'Gépágyútalálat' : 'Rakétatalálat',
  });
  target.damage = target.flight.damage;
  if (target.flight.dying) {
    target.alive = false;
    target.falling = true;
    return true;
  }
  return false;
}
const staticPoseCache = new WeakMap();
export function updateTargets(targets, dt) {
  for (const t of targets) {
    if (t.playerControlled || t.pending || t.exited) continue;
    if (
      t.type === 'attack-drone' ||
      ['mobile-sam', 'mobile-jammer', 'drone-command'].includes(t.type)
    ) {
      t.previousPosition = t.position.clone();
      if (t.alive) {
        if (t.type === 'attack-drone') moveAttackDrone(t, targets, dt);
        else moveMobileGround(t, targets, dt);
      }
      t.agl = t.position.y - terrainHeight(t.position.x, t.position.z);
      continue;
    }
    if (t.kind === 'ground' && t.type !== 'convoy' && t.type !== 'destroyer') {
      const p = staticPoseCache.get(t);
      if (
        !p ||
        p.revision !== terrainWorld.revision ||
        p.x !== t.position.x ||
        p.y !== t.position.y ||
        p.z !== t.position.z
      ) {
        ageEvasion(t, dt);
        t.previousPosition = t.position.clone();
        t.agl = t.position.y - terrainHeight(t.position.x, t.position.z);
        staticPoseCache.set(t, {
          revision: terrainWorld.revision,
          x: t.position.x,
          y: t.position.y,
          z: t.position.z,
        });
      }
      continue;
    }
    ageEvasion(t, dt);
    if (t.kind === 'air' && !t.flight) t.velocity = unitAirVelocity(t);
    t.previousPosition = t.position.clone();
    t.agl = t.position.y - terrainHeight(t.position.x, t.position.z);
    if (t.pending) continue;
    if (t.type === 'ballistic') {
      if (t.alive) moveBallistic(t, dt);
      continue;
    }
    if (t.aiRole === 'takeoff' && t.alive) {
      t.takeoffClock += dt;
      if (t.takeoffClock >= 0) {
        t.velocity.z = Math.min(t.cruiseSpeed, t.velocity.z + 6 * dt);
        if (t.velocity.z > 65) {
          t.velocity.y = Math.min(35, t.velocity.y + 8 * dt);
          t.pitch = 0.15;
        }
        t.position.add(t.velocity.clone().scale(dt));
        if (t.position.y > 900) t.aiRole = 'interceptor';
      }
      continue;
    }
    if (moveServiceTaxi(t, dt)) continue;
    if (t.flight && !t.flight.crashed) {
      stepAircraft(
        t.flight,
        t.retreat
          ? retreatFlightInput(t, dt)
          : t.service
            ? aiServiceInput(t)
            : t.evasion
              ? evasionFlightInput(t)
              : t.aiRole === 'refuel-receiver'
                ? refuelReceiverInput(t)
                : ['escortee', 'tanker'].includes(t.aiRole)
                  ? escortFlightInput(t)
                  : combatFlightInput(t),
        dt,
      );
      t.position = t.flight.position.clone();
      t.velocity = t.flight.velocity.clone();
      t.heading = attitude(t.flight.orientation).heading;
      t.damage = t.flight.damage;
      if (t.flight.dying) {
        t.alive = false;
        t.falling = true;
      }
      if (t.flight.crashed) {
        t.alive = false;
        t.falling = false;
        t.impactReady = true;
      }
    } else if (t.alive && !moveEvasiveAircraft(t, dt)) {
      if (t.civilian) updateCivilFlight(t, dt);
      else if (t.aiRole === 'escortee') moveEscort(t, dt);
      else if (t.aiRole === 'tanker') moveTanker(t, dt);
      else if (t.type === 'convoy') moveConvoy(t, targets, dt);
      else if (t.type === 'destroyer' && terrainWorld.ocean) {
        const carrier = targets.find(
            (target) => target.type === 'carrier' && target.team !== t.team,
          ),
          home = carrier?.position || new Vec3(),
          away = t.position.clone().sub(home).normalize(),
          goal = home.clone().add(away.scale(1200));
        // Keep a fixed goal so small heading changes do not invalidate the cached route.
        t.seaDestination ||= goal;
        moveOceanShip(t, t.seaDestination, terrainWorld.islands || [], terrainWorld.revision, dt);
      } else t.position.add(t.velocity.clone().scale(dt));
    }
    if (t.alive && t.kind === 'air' && !t.flight)
      advectNavigatingAircraft(
        t,
        terrainWorld.weather,
        dt,
        terrainHeight(t.position.x, t.position.z),
      );
    if (t.alive && t.aiRole === 'escortee' && t.position.z >= t.exitZ) {
      t.exited = true;
      t.alive = false;
    }
  }
}
export function radarContacts(s, targets) {
  const f = forward(s.orientation);
  return visibleTargets(s, targets).map((t) => {
    const d = t.position.clone().sub(s.position),
      distance = d.length(),
      angle = Math.acos(clamp(f.dot(d.clone().normalize()), -1, 1));
    return {
      target: t,
      distance,
      angle,
      selectable: targetSelectable(t, s, targets),
      visible: radarContact(s, t),
    };
  });
}
export class Targeting {
  constructor() {
    this.id = null;
    this.progress = 0;
    this.locked = false;
    this.selector = new TargetCycle();
  }
  cycle(s, targets) {
    const available = radarContacts(s, targets).filter((c) => c.visible && c.selectable);
    const next = this.selector.choose(available, s.orientation, this.id);
    if (!next) {
      this.id = null;
      this.progress = 0;
      this.locked = false;
      return null;
    }
    // Pressing select again must not restart acquisition of the only contact.
    if (next !== this.id) {
      this.id = next;
      this.progress = 0;
      this.locked = false;
    }
    return this.id;
  }
  update(s, targets, dt) {
    // No lock can progress without a selected contact. Avoid scanning every radar
    // ray at 120 Hz while idle; selection and the HUD still refresh contacts.
    if (this.id == null) {
      this.selector.reset();
      this.progress = 0;
      this.locked = false;
      return;
    }
    const c = radarContacts(s, targets).find((c) => c.target.id === this.id);
    if (!c || !c.visible || !c.selectable) {
      this.selector.reset();
      this.id = null;
      this.progress = 0;
      this.locked = false;
      return;
    }
    this.progress = Math.min(s.spec.lockTime, this.progress + dt);
    this.locked = this.progress >= s.spec.lockTime;
  }
}
export const bombImpact = predictBombImpact;

export function targetingStatus(s, targets, aim, weapons) {
  if (navigationJammed(s, targets))
    return {
      state: 'jammed',
      label: 'JELZAVARÁS · RADAR / NAV KIESÉS',
      hint: 'Keresd szemmel az antennás zavarókocsit. Ágyú vagy kézi bombavetés; a körön kívül újra befogható.',
      progress: 0,
    };
  const contacts = radarContacts(s, targets).filter((c) => c.selectable);
  const chosen = contacts.find((c) => c.target.id === aim.id);
  const contact = chosen || contacts.slice().sort((a, b) => a.distance - b.distance)[0];
  if (!contact && s.canyonTraining)
    return {
      state: 'clear',
      label: `KANYONGYAKORLAT · ${s.canyonTraining.index}/${s.canyonTraining.gates.length} KAPU`,
      hint: 'Kövesd sorban a türkiz kapukat és a Mission Control útmutatását.',
      progress: 0,
    };
  if (!contact)
    return {
      state: 'clear',
      label: 'NINCS AKTÍV CÉL',
      hint: targets.some((t) => t.alive && t.aiRole === 'escortee')
        ? 'Kísérd a kék jelű szállítót a kijáratig.'
        : 'Kövesd a Mission Control feladatát és a BASE jelzést.',
      progress: 0,
    };
  const d = contact.target.position.clone().sub(s.position),
    a = attitude(s.orientation);
  const bearing = (Math.atan2(d.x, d.z) / DEG + 360) % 360;
  const elevation = Math.atan2(d.y, Math.hypot(d.x, d.z)) / DEG - a.pitch / DEG;
  const direction = `IRÁNY ${Math.round(bearing).toString().padStart(3, '0')}°${elevation > 5 ? ' · ORR FEL (S)' : elevation < -5 ? ' · ORR LE (W)' : ''}`;
  const progress = aim.locked ? 100 : Math.round((aim.progress / s.spec.lockTime) * 100);
  if (contact.distance >= s.spec.radarRange)
    return {
      state: 'range',
      label: 'CÉL RADARHATÓTÁVON KÍVÜL',
      hint: `${direction} · KÖZELÍTS A CÉLHOZ`,
      progress: 0,
    };
  if (!contact.visible)
    return {
      state: 'outside',
      label: 'CÉL A RADARKÚPON KÍVÜL',
      hint: `${direction} · A/D: BEDÖNTÉS ÉS FORDULÁS`,
      progress: 0,
    };
  if (!chosen)
    return {
      state: 'search',
      label: 'CÉL ÉSZLELVE — T VAGY TAB',
      hint: 'Nyomd meg egyszer a T-t, vagy a Tab-bal válassz célt.',
      progress: 0,
    };
  if (!aim.locked)
    return {
      state: 'acquiring',
      label: `BEFOGÁS ${progress}%`,
      hint: 'Tartsd a célt a gép előtt 2 másodpercig. Nem kell nyomva tartani a T-t.',
      progress,
    };
  if (contact.target.civilian)
    return {
      state: 'locked',
      label: 'CIVIL GÉP BEFOGVA · TŰZTILALOM',
      hint: 'Ne tüzelj! A civil gép visszafordul és elhagyja a légteret.',
      progress,
    };
  const weapon = weapons.selected;
  const alternatives =
    (contact.target.kind === 'air' ? ['aam', 'gun'] : ['agm', 'bomb', 'gun'])
      .filter((type) => weaponAvailable(s, type))
      .map((type) => `${weaponKeys[type]}: ${weaponLabel(s, type)}`)
      .join(' · ') || 'NINCS MEGFELELŐ LŐSZER · TÉRJ HAZA';
  if (!weaponAvailable(s, weapon))
    return { state: 'locked', label: 'CÉL BEFOGVA · NINCS LŐSZER', hint: alternatives, progress };
  if (
    (weapon === 'aam' && contact.target.kind !== 'air') ||
    (weapon === 'agm' && contact.target.kind !== 'ground')
  )
    return { state: 'locked', label: 'CÉL BEFOGVA · VÁLTS FEGYVERT', hint: alternatives, progress };
  const status = firingStatus(s, targets, aim, weapons),
    solution = status.solution;
  const detail = status.canFire ? solution?.detail : status.label;
  return {
    state: 'locked',
    label: `CÉL BEFOGVA · ${status.canFire ? status.label : 'INDÍTÁS TILTVA: ' + status.label}`,
    hint: detail || '',
    progress,
    solution: solution
      ? {
          ...solution,
          status: status.status,
          detail: status.canFire ? solution.detail : status.label + ' · ' + solution.detail,
          canLaunch: status.canFire,
        }
      : null,
  };
}
