import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { aircraft } from '../src/aircraftSpec.js';
import { aircraftFlightSpec } from '../src/aiAircraftSpec.js';
import { createAircraft } from '../src/physics.js';
import { Vec3, Quat } from '../src/math.js';
import { configureTerrain, terrainWorld } from '../src/terrain.js';
import { Weapons } from '../src/weapons.js';
import { updateTargets, applyTargetHit } from '../src/targeting.js';
export function serviceProbe({
  id = 'f16',
  side = 'ally',
  field = true,
  damage = 0,
  seconds = 1200,
} = {}) {
  const f =
    side === 'enemy'
      ? { x: 12000, z: 20000, elevation: 180, heading: 0.4 }
      : { x: 0, z: 0, elevation: 0, heading: 0 };
  configureTerrain(
    { id: field && side === 'enemy' ? 'airbase' : 'landing' },
    new Vec3(f.x, 0, f.z),
    () => 0.5,
  );
  if (field) terrainWorld.airfields = [f];
  const p = createAircraft(aircraft[0]),
    rotation = Quat.euler(f.heading, 0, 0),
    spec = aircraftFlightSpec(id),
    t = {
      id: 'AI',
      team: side,
      kind: 'air',
      type: ['b52', 'tu95'].includes(id) ? 'bomber' : 'fighter',
      aircraftId: id,
      alive: true,
      position: rotation.rotate(new Vec3(0, 750, -13600)).add(new Vec3(f.x, f.elevation, f.z)),
      velocity: rotation.rotate(new Vec3(0, 0, 160)),
      heading: f.heading,
      cruiseSpeed: 165,
      threats: ['missile', 'gun'],
    },
    base = {
      id: 'AIRFIELD',
      home: side === 'ally',
      team: side,
      kind: 'ground',
      type: 'airbase',
      alive: true,
      heading: f.heading,
      position: new Vec3(f.x, f.elevation + 3, f.z),
      velocity: new Vec3(),
    },
    w = new Weapons({ enemyFire: true }),
    u = w.enemyCombat.unit(t),
    units = field ? [base, t] : [t];
  // This probe measures an unobstructed service cycle. Keep the observer off the runway;
  // a real parked player aircraft now correctly causes a physical collision.
  p.position = new Vec3(f.x + 3000, f.elevation + 1000, f.z + 5000);
  p.previousPosition = p.position.clone();
  p.onGround = false;
  p.airborne = true;
  u.missiles = 0;
  if (t.type === 'bomber') u.bombs = 0;
  if (damage) {
    applyTargetHit(t, 'gun', { amount: damage, part: 'weapons' });
    t.flight.condition.seed = 42;
  }
  const timeline = [];
  let last = '',
    time = 0;
  for (let i = 0; i < 60 * seconds; i++) {
    time = i / 60;
    updateTargets(units, 1 / 60);
    w.update(p, units, 1 / 60);
    const stage = t.service?.stage || t.retreat?.stage || 'combat';
    if (stage !== last) {
      last = stage;
      timeline.push({
        time,
        stage,
        position: { ...t.position },
        damage: t.damage || 0,
        ammo: { aam: u.missiles, agm: u.agm, bomb: u.bombs, gun: u.rounds },
        fuel: t.flight?.fuel,
      });
    }
    if (t.flight?.crashed || t.falling || (t.serviceCount && !t.service)) break;
  }
  return {
    id,
    side,
    field,
    damage,
    time,
    success: !!t.serviceCount && !t.service,
    crashed: !!t.flight?.crashed,
    alive: t.alive,
    stage: t.service?.stage || t.retreat?.stage || 'combat',
    fuel: t.flight?.fuel,
    fuelCapacity: spec.fuelCapacity,
    damageAfter: t.damage || 0,
    stores: {
      missiles: u.missiles,
      initialMissiles: u.initialMissiles,
      bombs: u.bombs,
      initialBombs: u.initialBombs,
    },
    timeline,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = [
    serviceProbe(),
    serviceProbe({ side: 'enemy' }),
    serviceProbe({ field: false }),
    serviceProbe({ damage: 40 }),
    serviceProbe({ id: 'b52' }),
  ];
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
}
