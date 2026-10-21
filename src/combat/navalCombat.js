import { combatSource } from '../unitCombat.js';
import { radarContact } from '../sensors.js';
import { navigationJammed } from '../electronicWarfare.js';
import { teamOf } from '../unitTypes.js';
import { Vec3, Quat } from '../math.js';
import { aiMissileDecision, missileCommitmentKey } from '../aiFireDiscipline.js';
import {
  enemyProfile,
  gunLead,
  clearWeaponLine as clearFireLine,
  guidedLaunchStatus,
  gunEffectiveRange,
} from '../weaponDynamics.js';
export function updateCarrierMissiles(
  combat,
  t,
  player,
  targets,
  w,
  u,
  dt,
  countProjectiles,
  commitments,
) {
  u.missile -= dt;
  if (
    u.missile > 0 ||
    u.missiles <= 0 ||
    countProjectiles(t.team === 'ally' ? 'ally' : 'enemy', true) >= 6
  )
    return;
  const source = combatSource(t, player),
    profile = enemyProfile(t, 'aam'),
    side = teamOf(t, player);
  const candidates = [...targets, player].filter(
    (v) =>
      v !== t &&
      v.alive !== false &&
      !v.exited &&
      !v.crashed &&
      !v.dying &&
      !v.flight?.dying &&
      !v.flight?.crashed &&
      teamOf(v, player) !== side &&
      teamOf(v, player) !== 'neutral' &&
      (v.kind === 'air' || (v === player && player.airborne && !player.onGround)) &&
      t.position.distance(v.position) <= profile.maxRange &&
      radarContact(source, v),
  );
  candidates.sort(
    (a, b) =>
      (b.type === 'bomber') - (a.type === 'bomber') ||
      t.position.distance(a.position) - t.position.distance(b.position),
  );
  u.missile = 0.35;
  if (navigationJammed(source, targets)) return;
  for (const target of candidates) {
    const key = missileCommitmentKey(
        side,
        target.playerControlled || target === player ? 'PLAYER' : target.id,
      ),
      status = guidedLaunchStatus(source, target, profile),
      decision = aiMissileDecision(u, status, {
        inbound: commitments.get(key) || 0,
        urgentDefense: target.type === 'bomber' && target.aiTargetId === t.id,
      });
    u.missileDecision = decision;
    if (!decision.allow) continue;
    u.launchRange = status.maxRange;
    combat.launch('missile', t, target, w, u);
    u.missiles--;
    u.missile = 8;
    commitments.set(key, (commitments.get(key) || 0) + 1);
    return;
  }
}
export function updateCarrierGuns(combat, t, player, targets, w, u, dt, countProjectiles) {
  const profile = enemyProfile(t, 'gun'),
    source = combatSource(t, player),
    side = teamOf(t, player),
    orientation = Quat.euler(t.heading || 0, 0, 0);
  u.carrierGuns ??= [-115, 115].map((z, i) => ({
    id: 'carrier-' + (i + 1),
    offset: new Vec3(-31, 24, z),
    seed: (u.seed + i * 7919) >>> 0,
    gun: 1,
    gunBurst: 0,
    rounds: 1800,
  }));
  const assigned = new Set();
  for (const mount of u.carrierGuns) {
    mount.gun -= dt;
    const origin = orientation.rotate(mount.offset).add(t.position);
    const eligible = [...targets, player].filter(
      (v) =>
        v !== t &&
        v.alive !== false &&
        !v.exited &&
        !v.crashed &&
        !v.dying &&
        !v.flight?.dying &&
        !v.flight?.crashed &&
        teamOf(v, player) !== side &&
        teamOf(v, player) !== 'neutral' &&
        (v.kind === 'air' || (v === player && player.airborne && !player.onGround)) &&
        origin.distance(v.position) < gunEffectiveRange(t, profile) &&
        radarContact(source, v) &&
        clearFireLine(origin, v.position),
    );
    const available = eligible.filter((v) => !assigned.has(v.id || 'PLAYER')),
      pool = available.length ? available : eligible;
    const target =
      pool.find((v) => (v.id || 'PLAYER') === mount.targetId) ||
      pool.sort((a, b) => origin.distance(a.position) - origin.distance(b.position))[0];
    mount.targetId = target ? target.id || 'PLAYER' : null;
    if (!target || mount.rounds <= 0) continue;
    assigned.add(mount.targetId);
    if (mount.gun > 0 || countProjectiles(t.team === 'ally' ? 'ally' : 'enemy') >= 220) continue;
    const lead = gunLead(
      { position: origin, muzzlePosition: origin, velocity: new Vec3(), orientation },
      target,
      profile,
    );
    if (!lead.reachable) {
      mount.gun = 0.2;
      continue;
    }
    if (!mount.gunBurst) mount.gunBurst = 10;
    combat.launch('gun', t, target, w, mount, {
      origin,
      direction: lead.direction,
      profile,
      turret: mount.id,
      distance: origin.distance(target.position),
      effectiveRange: gunEffectiveRange(t, profile),
    });
    mount.rounds--;
    mount.gunBurst--;
    mount.gun = mount.gunBurst ? 0.05 : 3 + combat.random(mount) * 2;
  }
  u.rounds = u.carrierGuns.reduce((sum, m) => sum + m.rounds, 0);
  u.initialRounds = 3600;
  u.missionTargetId = u.carrierGuns[0].targetId;
}
