// Test-only observer: put the missing human seat back under ordinary AI control.
// The off-map camera context is not airborne, has no call sign and cannot be
// selected by air-defense/fighter logic. No combat actor gains health or ammo.
import { Vec3 } from '../../src/math.js';
import { terrainWorld } from '../../src/terrain.js';
import { formatCallSign } from '../../src/airSuperiority.js';
export function configureBattlefieldObserver(plane, targets, state) {
  const start = terrainWorld.battlefieldStart;
  if (!start) throw new Error('Observer requires a battlefield start seat');
  const template = targets.find((t) => t.squad === start.squad && t.type === start.role);
  if (!template) throw new Error('Missing ordinary AI seat template');
  const id = start.squad.toUpperCase() + '-' + (start.slot + 1);
  if (targets.some((t) => t.id === id)) throw new Error('Observer seat already exists');
  targets.push({
    ...template,
    id,
    aircraftId: plane.id,
    name: formatCallSign(start.radioCallSign) + ' · ' + plane.name,
    position: start.position.clone(),
    previousPosition: start.position.clone(),
    velocity: new Vec3(
      Math.sin(start.heading) * start.speed,
      0,
      Math.cos(start.heading) * start.speed,
    ),
    heading: start.heading,
    formationSlot: start.slot,
    radioCallSign: { ...start.radioCallSign },
  });
  Object.assign(state, {
    coalition: 'observer',
    airborne: false,
    onGround: true,
    radioCallSign: null,
    squad: null,
    formationRole: null,
    position: new Vec3(150000, 10000, 150000),
    previousPosition: new Vec3(150000, 10000, 150000),
    velocity: new Vec3(),
    agl: 10000,
  });
  return id;
}
