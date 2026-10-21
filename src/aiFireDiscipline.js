// Shared tactical policy: physical launch permission is always authoritative.
// effectiveRange already accounts for the actual missile, height and target motion.
export function aiMissileDecision(
  unit,
  solution,
  { defendingBase = false, urgentDefense = defendingBase, inbound = 0, supportAtRisk = false } = {},
) {
  if (unit.missiles <= 0) return { allow: false, reason: 'empty' };
  if (!solution.canLaunch) return { allow: false, reason: solution.status };
  const effective = solution.effectiveRange ?? solution.maxRange ?? 0;
  const initial = unit.initialMissiles ?? unit.missiles,
    reserve = Math.floor(initial / 2);
  const closeRange = Math.min(
    urgentDefense ? 14000 : 8000,
    effective * (urgentDefense ? 0.85 : 0.65),
  );
  const tacticalRange = Math.min(
    solution.maxRange ?? Infinity,
    effective * (urgentDefense ? 1.1 : 1),
  );
  const salvoLimit = urgentDefense || solution.distance <= closeRange ? 2 : 1;
  const details = { reserve, closeRange, tacticalRange, inbound, salvoLimit, urgentDefense };
  if (supportAtRisk) return { ...details, allow: false, reason: 'preserve-guidance-support' };
  if (unit.missiles <= reserve && solution.distance > closeRange)
    return { ...details, allow: false, reason: 'reserve-close-range' };
  if (solution.distance > tacticalRange)
    return { ...details, allow: false, reason: 'wait-favorable-range' };
  if (inbound >= salvoLimit) return { ...details, allow: false, reason: 'await-inbound-result' };
  return { ...details, allow: true, reason: 'ready' };
}
export const missileCommitmentKey = (side, targetId) => side + ':' + targetId;
// One pass per combat tick, including the player's shots. Lost/diverted missiles
// no longer commit an attack slot; no opponent countermeasure stock is inspected.
export function missileCommitments(projectiles) {
  const result = new Map();
  for (const p of projectiles) {
    if (
      !['aam', 'agm'].includes(p.type) ||
      p.seekerLost ||
      p.decoyId !== undefined ||
      p.age >= (p.profile?.life ?? Infinity)
    )
      continue;
    const target = p.targetPlayer ? 'PLAYER' : p.targetEntityId || p.targetId;
    if (!target) continue;
    const key = missileCommitmentKey(p.owner === 'enemy' ? 'enemy' : 'ally', target);
    result.set(key, (result.get(key) || 0) + 1);
  }
  return result;
}
