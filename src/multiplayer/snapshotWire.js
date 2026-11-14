import { PROJECTILE_LIMIT } from './protocol.js';
import { weaponProfiles } from '../weaponDynamics.js';
const projectileTypes = new Set(['gun', 'flak', 'aam', 'agm', 'bomb']);
function validTuple(p) {
  if (
    !Array.isArray(p) ||
    p.length !== 15 ||
    !Number.isSafeInteger(p[0]) ||
    p[0] < 0 ||
    !projectileTypes.has(p[1]) ||
    (!(p[1] === 'flak' && p[2] === null) &&
      !(typeof p[2] === 'string' && Object.hasOwn(weaponProfiles, p[2]))) ||
    typeof p[13] !== 'boolean' ||
    typeof p[14] !== 'boolean'
  )
    return false;
  for (let i = 3; i < 6; i++)
    if (p[i] !== null && (typeof p[i] !== 'string' || p[i].length > 128)) return false;
  for (let i = 6; i < 13; i++) if (typeof p[i] !== 'number' || !Number.isFinite(p[i])) return false;
  return true;
}
// Versioned, lossless tuples omit repeated field names only. Authoritative
// values retain full precision; expanded objects stay private to this packet.
export function expandSnapshot(message) {
  const combat = message?.combat;
  if (combat?.projectileFormat === undefined) return message;
  if (
    combat.projectileFormat !== 1 ||
    !Array.isArray(combat.projectiles) ||
    combat.projectiles.length > PROJECTILE_LIMIT
  )
    throw new Error('Unsupported projectile packet');
  const projectiles = combat.projectiles.map((p) => {
    if (!validTuple(p)) throw new Error('Invalid projectile tuple');
    return {
      id: p[0],
      type: p[1],
      ...(p[2] === null ? {} : { profile: p[2] }),
      ...(p[3] === null ? {} : { sourceId: p[3] }),
      ...(p[4] === null ? {} : { owner: p[4] }),
      ...(p[5] === null ? {} : { targetId: p[5] }),
      position: { x: p[6], y: p[7], z: p[8] },
      velocity: { x: p[9], y: p[10], z: p[11] },
      age: p[12],
      armed: p[13],
      seekerLost: p[14],
    };
  });
  const expandedCombat = { ...combat, projectiles };
  delete expandedCombat.projectileFormat;
  return { ...message, combat: expandedCombat };
}
