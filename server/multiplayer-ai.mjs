import { EnemyCombat } from '../src/enemyCombat.js';
import {
  updateAIDefense,
  beginRetreat,
  combatFlightInput,
  retreatFlightInput,
  ageEvasion,
} from '../src/aiDefense.js';
import { Vec3, Quat } from '../src/math.js';
import { spawnAircraft } from '../src/multiplayer/flightState.js';
import { PROJECTILE_LIMIT } from '../src/multiplayer/protocol.js';
export const AI_ACTIVATION_SECONDS = 20;
export function createRoomAI(world) {
  const flight = spawnAircraft('mig29', 0, world.skySeed ^ 19231, { armed: true });
  const heading = Math.atan2(-5000, -26000),
    trim = Math.asin(flight.orientation.rotate(new Vec3(0, 0, 1)).y);
  flight.position = new Vec3(5000, 3200, 18000);
  flight.orientation = Quat.euler(heading, trim, 0);
  flight.velocity = new Vec3(Math.sin(heading) * 180, 0, Math.cos(heading) * 180);
  flight.landingMode = 'off';
  const unit = {
    id: 'HOSTILE-ONE',
    name: 'Ellenséges vadász',
    kind: 'air',
    type: 'fighter',
    team: 'enemy',
    faction: flight.spec.faction,
    aircraftId: flight.spec.id,
    aiControlled: true,
    threats: ['missile', 'gun'],
    position: flight.position,
    velocity: flight.velocity,
    heading,
    flight,
    alive: true,
    radius: 28,
    cruiseSpeed: 200,
    combatSeed: world.skySeed ^ 5519,
  };
  // This inert context supplies team/reference data only. Every real pilot is an
  // ordinary entity with a unique id, so no host receives the old PLAYER shortcut.
  const observer = {
    id: 'ROOM-CONTEXT',
    team: 'neutral',
    kind: 'air',
    alive: false,
    crashed: true,
    dying: true,
    airborne: false,
    onGround: true,
    agl: 0,
    position: new Vec3(),
    velocity: new Vec3(),
    orientation: new Quat(),
    spec: { faction: 'west', radarRange: 0 },
  };
  return {
    controller: new EnemyCombat({ warmup: 0, projectileLimit: PROJECTILE_LIMIT }),
    units: [unit],
    observer,
    active: false,
    remaining: AI_ACTIVATION_SECONDS,
  };
}
export function planRoomAI(room, pilots, dt) {
  const ai = room.combat.ai;
  if (!ai) return;
  const activePilots = pilots.filter((p) => p.alive && !p.flight.onGround);
  ai.observer.position = activePilots
    .reduce((p, t) => p.add(t.position), new Vec3())
    .scale(1 / Math.max(1, activePilots.length));
  ai.remaining = Math.max(
    0,
    AI_ACTIVATION_SECONDS - (room.mission?.elapsedTicks ?? room.tick) * dt,
  );
  ai.active = ai.remaining === 0;
  // AI defenses never run on manually controlled pilots; their C input is authoritative.
  updateAIDefense(ai.observer, ai.units, room.combat.weapons, dt);
  if (ai.active)
    ai.controller.update(ai.observer, [...room.combat.targets, ...pilots], room.combat.weapons, dt);
  for (const t of ai.units) {
    const unit = ai.controller.units.get(t.id);
    if (unit && !t.retreat && t.alive && !t.flight.dying && unit.missiles <= 0 && unit.rounds <= 0)
      beginRetreat(t, ai.units, ai.observer, room.combat.weapons, 'weapons-empty');
    if (unit)
      Object.assign(t.flight.ammo, {
        gun: unit.rounds,
        aam: unit.missiles,
        agm: unit.agm,
        bomb: unit.bombs,
      });
  }
}
export function roomAIInput(room, t, dt) {
  if (!t.aiControlled) return {};
  if (t.retreat) return retreatFlightInput(t, dt);
  return room.combat.ai.active || t.evasion ? combatFlightInput(t) : {};
}
export function finishRoomAI(t, dt) {
  if (t.aiControlled) ageEvasion(t, dt);
}
export function roomAIStatus(room) {
  const ai = room.combat.ai;
  return ai ? { active: ai.active, remaining: ai.remaining } : null;
}
