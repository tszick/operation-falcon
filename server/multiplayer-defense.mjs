import { createBattleTargets } from '../src/scenarioSpawn.js';
import { missions } from '../src/missionCatalog.js';
import { aircraft } from '../src/aircraftSpec.js';
import { aircraftFlightSpec } from '../src/aiAircraftSpec.js';
import { createAircraft, mass } from '../src/physics.js';
import { createMissionAircraft } from '../src/missionStart.js';
import { configureAircraft } from '../src/loadoutPlanner.js';
import { createDamage } from '../src/damage.js';
import { terrainWorld, withTerrainSnapshot } from '../src/terrain.js';
import { Vec3, Quat, clamp } from '../src/math.js';
import { atmosphere } from '../src/atmosphere.js';
export const defenseMission = missions.find((m) => m.id === 'defend-base');
export function createDefenseScene(world) {
  let seed = world.skySeed,
    first = true;
  const random = () => {
    if (first) {
      first = false;
      return 0;
    }
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return withTerrainSnapshot(world, () => {
    const targets = createBattleTargets(
      defenseMission,
      aircraft.find((a) => a.id === 'f16'),
      { rng: random },
    );
    const environment = {
      ...terrainWorld,
      revision: world.revision + 1,
      skySeed: world.skySeed,
      surface: 'winter',
    };
    let index = 0;
    for (const t of targets)
      if (t.kind === 'air') {
        const s = createAircraft(aircraftFlightSpec(t.aircraftId));
        s.position = t.position.clone();
        s.previousPosition = s.position.clone();
        s.velocity = t.velocity.clone();
        Object.assign(s, {
          onGround: false,
          airborne: true,
          gear: false,
          flaps: false,
          flapPosition: 0,
          throttle: 0.65,
          engineSpool: 0.65,
          fuel: s.spec.fuelCapacity * 0.7,
          landingMode: 'off',
          condition: createDamage(world.skySeed ^ ++index),
        });
        const speed = s.velocity.length(),
          q = 0.5 * atmosphere(s.position.y).density * speed * speed;
        const alpha = clamp(
          ((mass(s) * 9.81) / (q * s.spec.wingArea) - (s.spec.liftZero ?? 0.22)) / s.spec.clSlope,
          -0.1,
          0.15,
        );
        s.orientation = Quat.euler(t.heading, alpha, 0);
        s.weather = environment.weather;
        t.flight = s;
        t.aiControlled = true;
        if (t.team === 'ally') t.displayCallSign = 'Guardian One';
      }
    return { world: environment, targets };
  });
}
export function defensePlayer(room, p) {
  return withTerrainSnapshot(room.world, () => {
    const base = aircraft.find((a) => a.id === p.selection.aircraftId),
      spec = configureAircraft(base, p.selection.loadout);
    const s = createMissionAircraft(spec, defenseMission, {
      fuelFraction: p.selection.fuelFraction,
    });
    s.condition = createDamage(p.spawnSeed);
    s.loadoutChoice = structuredClone(p.selection.loadout);
    s.position = new Vec3(p.slot ? 16 : -16, 2, -1050 - p.slot * 105);
    s.previousPosition = s.position.clone();
    s.landingRouteEnabled = true;
    return s;
  });
}
