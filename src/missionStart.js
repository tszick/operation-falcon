import {
  refuellingRules,
  refuellingAttackerStart,
  refuellingAttackerHeading,
} from './aerialRefuelling.js';
import { missionWeather, windAt } from './flightEnvironment.js';
import { selectRecoveryAirfield } from './recoveryAirfields.js';
import { initialiseNaval } from './navalOps.js';
import { trainingAircraft, isPracticeMission, unarmedPractice } from './trainingAircraft.js';
import { superiorityPlan } from './airSuperiority.js';
import { createCanyonCourse, canyonPoint } from './canyonTraining.js';
import { createAircraft } from './physics.js';
import { Vec3, Quat, DEG, clamp } from './math.js';
import { runway, terrainHeight, terrainWorld, configureTerrain } from './terrain.js';
import { mass, atmosphere, approachSpeeds } from './performance.js';
import { evaluateApproach } from './landing.js';
export const landingStart = { distance: 6000, glide: 3, fuelFraction: 0.15 };
export function defaultMissionFuel(mission, spec = null) {
  if (mission.objective === 'aerial-refuelling' && mission.side !== 'east')
    return refuellingRules.startFuel;
  return mission.objective === 'landing'
    ? landingStart.fuelFraction
    : mission.objective === 'canyon'
      ? 0.5
      : spec?.id === 'b52'
        ? 0.9
        : 1;
}
export function createMissionAircraft(
  spec,
  mission,
  { fuelFraction = defaultMissionFuel(mission, spec) } = {},
) {
  if (mission.naval && spec.trainingOnly)
    throw new Error('A kiképzőgép csak gyakorlópályán használható.');
  if (mission.naval && !mission.mirrored && !spec.carrierCapable)
    throw new Error('Ehhez a bevetéshez fedélzeti repülőgép szükséges.');
  if (isPracticeMission(mission)) spec = trainingAircraft;
  else if (spec.transport && !['escort-transport', 'iron-veil'].includes(mission.objective))
    throw new Error('Szállító csak szállítós küldetésen választható.');
  else if (spec.trainingOnly) throw new Error('A kiképzőgép csak gyakorlópályán használható.');
  if (
    spec.experimentalOnly &&
    (mission.objective !== 'flight-test' || spec.faction !== mission.side)
  )
    throw new Error('Ez a kísérleti gép csak a saját berepülési programjában választható.');
  if (mission.objective === 'flight-test' && !spec.experimentalOnly)
    throw new Error('A berepüléshez kísérleti repülőgép szükséges.');
  const s = createAircraft(spec);
  s.weather = missionWeather(mission);
  s.practice = isPracticeMission(mission);
  if (spec.transport) s.radioCallSign = { flight: 'Nomad', number: 1 };
  if (unarmedPractice(mission)) {
    s.training = true;
    s.ammo = { gun: 0, aam: 0, agm: 0, bomb: 0 };
  }
  if (mission.objective === 'practice-bombing')
    s.bombingPractice = { shots: 0, hits: 0, impacts: [], targetId: 'RANGE' };
  s.fuel =
    spec.fuelCapacity *
    (Number.isFinite(fuelFraction) ? clamp(fuelFraction, 0, 1) : defaultMissionFuel(mission));
  s.noAirfield = !!mission.noAirfield;
  if (mission.objective === 'aerial-refuelling' && mission.side !== 'east')
    s.fuel = Math.min(s.fuel, spec.fuelCapacity * refuellingRules.startFuel);
  s.enginePower = s.fuel > 0 ? 1 : 0;
  if (mission.objective === 'canyon') {
    if (!terrainWorld.canyon?.training) configureTerrain(mission);
    s.training = true;
    s.ammo = { gun: 0, aam: 0, agm: 0, bomb: 0 };
    s.canyonTraining = createCanyonCourse();
  }
  if (mission.mirrored) {
    const start = terrainWorld.sideStart;
    if (!start) throw new Error('Előbb a tükrözött hadszínteret kell létrehozni.');
    s.onGround = false;
    s.airborne = true;
    s.gear = false;
    s.flaps = false;
    s.flapPosition = 0;
    s.landingMode = 'off';
    s.position = start.position.clone();
    s.previousPosition = s.position.clone();
    const v = start.speed,
      air = atmosphere(s.position.y),
      q = 0.5 * air.density * v * v;
    const alpha = clamp(
      ((mass(s) * 9.81) / (q * spec.wingArea) - (spec.liftZero ?? 0.22)) / spec.clSlope,
      spec.liftZero ? -0.12 : 0,
      0.16,
    );
    s.orientation = Quat.euler(start.heading, alpha, 0);
    s.velocity = new Vec3(Math.sin(start.heading) * v, 0, Math.cos(start.heading) * v);
    s.throttle = 0.7;
    s.engineSpool = s.throttle;
    s.velocity.add(windAt(s.weather, s.position, 0, terrainHeight(s.position.x, s.position.z)));
    s.speed = v;
    s.ias = v * Math.sqrt(air.density / 1.225);
    s.mach = v / air.soundSpeed;
    s.alpha = alpha;
    s.agl = s.position.y - terrainHeight(s.position.x, s.position.z);
    s.airfield = start.airfield;
    s.recoveryExit = start.recoveryExit?.clone();
    s.radioCallSign = { flight: 'Falcon', number: 1 };
    s.squad = start.squad;
    s.formationSlot = start.formationSlot;
    return s;
  }
  if (mission.airStart) {
    s.onGround = false;
    s.airborne = true;
    s.gear = false;
    s.flaps = false;
    s.flapPosition = 0;
    s.landingMode = 'off';
    s.position = new Vec3(0, 1700, mission.objective === 'escort-transport' ? -23000 : -9000);
    if (mission.noAirfield)
      s.position = new Vec3(
        mission.side === 'east' ? refuellingAttackerStart.x : 0,
        mission.side === 'east' ? refuellingAttackerStart.y : 2200,
        mission.side === 'east' ? refuellingAttackerStart.z : -18000,
      );
    if (s.canyonTraining) {
      const p = canyonPoint(-1600);
      s.position = new Vec3(p.x, terrainHeight(p.x, p.z) + 220, p.z);
    }
    const formation = mission.battlefield
      ? terrainWorld.battlefieldStart
      : mission.objective === 'air-superiority'
        ? terrainWorld.airBattle?.playerStart || superiorityPlan(spec).playerStart
        : null;
    if (formation) {
      s.position = formation.position.clone();
      s.squad = formation.squad;
      s.formationSlot = formation.slot;
      s.formationRole = formation.role;
      s.radioCallSign = formation.radioCallSign;
      s.fallbackRecoveryExit = formation.withdrawalPoint?.clone();
    }
    const heading =
        mission.noAirfield && mission.side === 'east'
          ? refuellingAttackerHeading
          : formation?.heading || 0,
      air = atmosphere(s.position.y),
      v = 165;
    s.velocity = new Vec3(Math.sin(heading) * v, 0, Math.cos(heading) * v);
    const q = 0.5 * air.density * v * v,
      alpha = clamp(
        ((mass(s) * 9.81) / (q * spec.wingArea) - (spec.liftZero ?? 0.22)) / spec.clSlope,
        spec.liftZero ? -0.12 : 0,
        0.2,
      );
    s.orientation = Quat.euler(heading, alpha, 0);
    s.throttle = 0.65;
    s.engineSpool = s.throttle;
    s.velocity.add(windAt(s.weather, s.position, 0, terrainHeight(s.position.x, s.position.z)));
    s.speed = v;
    s.ias = v * Math.sqrt(air.density / 1.225);
    s.mach = v / air.soundSpeed;
    s.agl = s.position.y - terrainHeight(s.position.x, s.position.z);
    s.previousPosition = s.position.clone();
    if (mission.battlefield) {
      s.coalition = mission.side || 'west';
      s.multipleAirfields = true;
      selectRecoveryAirfield(s, terrainWorld.recoverySites || []);
    }
    return s;
  }
  if (mission.naval) return initialiseNaval(s);
  if (mission.objective !== 'landing') return s;
  s.training = true;
  s.ammo = { gun: 0, aam: 0, agm: 0, bomb: 0 };
  s.onGround = false;
  s.airborne = true;
  s.gear = false;
  s.flaps = false;
  s.flapPosition = 0;
  s.afterburner = false;
  s.landingMode = 'off';
  const glide = landingStart.glide * DEG,
    height = 2 + landingStart.distance * Math.tan(glide),
    air = atmosphere(height),
    ias = (approachSpeeds(s).target + 25) / 3.6,
    v = ias / Math.sqrt(air.density / 1.225),
    q = 0.5 * air.density * v * v,
    m = mass(s),
    cl = (m * 9.81 * Math.cos(glide)) / (q * spec.wingArea),
    alpha = clamp(
      (cl - (spec.liftZero ?? 0.22)) / spec.clSlope,
      spec.liftZero ? -0.12 : 0,
      spec.stallAlpha * 0.85,
    );
  s.position = new Vec3(0, height, -runway.halfLength - landingStart.distance);
  s.previousPosition = s.position.clone();
  s.velocity = new Vec3(0, -v * Math.sin(glide), v * Math.cos(glide));
  s.orientation = Quat.euler(0, alpha - glide, 0);
  const drag = q * spec.wingArea * (spec.cd0 + spec.inducedDrag * cl * cl),
    available =
      spec.thrust *
      clamp(air.density / 1.225, 0.23, 1) *
      clamp(1 - (v / (spec.maxMach * air.soundSpeed)) * 0.22, 0.4, 1);
  s.throttle = clamp(
    (drag - m * 9.81 * Math.sin(glide)) / Math.max(1, available * Math.cos(alpha)),
    0.08,
    0.75,
  );
  s.engineSpool = s.throttle;
  s.velocity.add(windAt(s.weather, s.position, 0, terrainHeight(s.position.x, s.position.z)));
  s.speed = v;
  s.ias = ias;
  s.mach = v / air.soundSpeed;
  s.alpha = alpha;
  s.g = Math.cos(glide);
  s.agl = height - terrainHeight(0, s.position.z);
  s.enginePower = s.fuel > 0 ? 1 : 0;
  s.approach = evaluateApproach(s);
  return s;
}

export function serviceAircraft(s) {
  if (s.bombingPractice) return s; // The scored three-bomb exercise has no resupply.
  const naval = !!s.airfield?.carrier,
    fresh = createAircraft(s.spec),
    keep = {
      weather: s.weather,
      airfield: s.airfield,
      coalition: s.coalition,
      multipleAirfields: s.multipleAirfields,
      recoveryExit: s.recoveryExit,
      fallbackRecoveryExit: s.fallbackRecoveryExit,
      practice: s.practice,
      training: s.training,
      elapsed: s.elapsed,
      lastTouchdown: s.lastTouchdown,
      landingRouteEnabled: s.landingRouteEnabled,
      headLook: s.headLook,
      mapZoom: s.mapZoom,
      squad: s.squad,
      formationSlot: s.formationSlot,
      formationRole: s.formationRole,
      radioCallSign: s.radioCallSign,
    };
  for (const key of Object.keys(s)) delete s[key];
  Object.assign(s, fresh, keep);
  if (naval) initialiseNaval(s);
  else if (s.airfield) {
    s.position = s.airfield.position.clone();
    s.position.y = s.airfield.elevation + 2;
    s.previousPosition = s.position.clone();
    s.orientation = Quat.euler(s.airfield.heading || 0, 0, 0);
  }
  if (s.training) s.ammo = { gun: 0, aam: 0, agm: 0, bomb: 0 };
  return s;
}
