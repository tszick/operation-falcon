import { Vec3 } from './math.js';
import { configureTerrain, terrainWorld, terrainHeight } from './terrain.js';
import { unitDefinition } from './unitTypes.js';
import { playerStrikeRole, formatCallSign } from './airSuperiority.js';
import { aircraftFlightSpec } from './aiAircraftSpec.js';

// Declarative scenarios share ordinary targets and ordinary combat; no scenario-specific damage/AI.
export function createBattlefieldTargets(m, player, rng = Math.random) {
  configureTerrain(m, undefined, rng);
  const side = m.side || 'west',
    targets = [],
    assets = m.battlefield.assets;
  const add = (id, type, coalition, position, extra = {}) => {
    const def = unitDefinition(type),
      air = def.kind === 'air';
    const t = {
      id,
      type,
      kind: def.kind,
      name: def.name,
      role: def.role,
      team: coalition === side ? 'ally' : 'enemy',
      faction: coalition,
      coalition,
      threats: def.weapons.filter((w) => w !== 'jammer'),
      alive: true,
      heading: 0,
      position: new Vec3(...position),
      velocity: new Vec3(),
      radius: air ? 28 : 60,
      health: def.health || 100,
      maxHealth: def.health || 100,
      combatSeed: Math.floor(rng() * 0xffffffff),
      ...extra,
    };
    if (!air)
      t.position.y = ['carrier', 'destroyer'].includes(type)
        ? 0
        : terrainHeight(t.position.x, t.position.z);
    t.previousPosition = t.position.clone();
    targets.push(t);
    return t;
  };
  for (const a of assets) {
    const t = add(a.id, a.type, a.side, a.position, { heading: a.heading || 0, remoteHome: true });
    if (a.type === 'airbase') {
      terrainWorld.airfields ??= [];
      terrainWorld.airfields.push({
        x: t.position.x,
        z: t.position.z,
        heading: t.heading,
        elevation: t.position.y,
      });
    }
    if (a.type === 'destroyer')
      t.velocity = new Vec3(Math.sin(t.heading) * 10, 0, Math.cos(t.heading) * 10);
    t[a.side + 'Base'] = ['carrier', 'airbase'].includes(a.type);
  }
  const slot = playerStrikeRole(player) ? 0 : 1;
  const squadCount = m.battlefield.flights.find((f) => f.side === side).squadrons;
  const squad = Math.min(squadCount - 1, Math.floor(rng() * squadCount));
  for (const f of m.battlefield.flights) {
    const friendly = f.side === side;
    for (let wave = 1; wave <= f.waves; wave++)
      for (let group = 0; group < f.squadrons; group++)
        for (let member = 0; member < 4; member++) {
          const q = f.heading,
            lateral = (group - 1) * 3200 + [0, -450, 450, 900][member],
            trail = member === 0 ? -550 : 0;
          const position = new Vec3(
            f.position[0] + Math.cos(q) * lateral + Math.sin(q) * trail,
            f.position[1] + group * 180 + (member ? 100 : 0),
            f.position[2] - Math.sin(q) * lateral + Math.cos(q) * trail,
          );
          const heading = q,
            speed = 165,
            role = member === 0 ? 'bomber' : 'fighter';
          const flight = friendly
            ? group === squad
              ? 'Falcon'
              : ['Ironfist', 'Viper'][group < squad ? group : group - 1]
            : ['Raven', 'Wolf', 'Cobra'][group];
          const call = {
            flight,
            number:
              friendly && group === squad
                ? member === slot
                  ? 1
                  : member < slot
                    ? member + 2
                    : member + 1
                : member + 1,
          };
          if (friendly && wave === 1 && group === squad && member === slot) {
            terrainWorld.battlefieldStart = {
              position,
              heading,
              speed,
              squad: f.side + '-W1-S' + (group + 1),
              slot,
              role,
              radioCallSign: call,
            };
            continue;
          }
          const t = add(
            f.side.toUpperCase() + '-W' + wave + '-S' + (group + 1) + '-' + (member + 1),
            role,
            f.side,
            [position.x, position.y, position.z],
            {
              heading,
              cruiseSpeed: speed,
              squad: f.side + '-W' + wave + '-S' + (group + 1),
              formationSlot: member,
              wave,
              spawnAt: (wave - 1) * f.interval,
              pending: wave > 1,
              alive: wave === 1,
              radioCallSign: call,
              aiRole: role === 'fighter' ? 'interceptor' : undefined,
              aiTargetId: role === 'bomber' ? f.attack[group % f.attack.length] : undefined,
              defendGroup: f.side + 'Base',
              physicalRecovery: !!f.physicalRecovery,
            },
          );
          t.aircraftId = member === 0 ? f.bomber : f.fighter;
          t.name = formatCallSign(call) + ' · ' + aircraftFlightSpec(t.aircraftId).name;
          t.velocity = new Vec3(Math.sin(heading) * speed, 0, Math.cos(heading) * speed);
        }
  }
  const home = targets.find((t) => t.team === 'ally' && t.type === 'airbase');
  if (home) home.home = true;
  terrainWorld.recoverySites = targets.filter((t) => ['airbase', 'carrier'].includes(t.type));
  return targets;
}

export function updateBattlefieldRuntime(s, m, targets, w) {
  const released = new Set();
  for (const t of targets)
    if (t.pending && s.elapsed >= t.spawnAt) {
      t.pending = false;
      t.alive = true;
      t.previousPosition = t.position.clone();
      released.add(t.wave);
    }
  for (const wave of released) w.emit?.({ type: 'mission-wave', wave, time: s.elapsed });
  m.wave = Math.max(
    1,
    ...targets.filter((t) => t.kind === 'air' && !t.pending).map((t) => t.wave || 1),
  );
  // Existing bomber AI already reselects lost targets. Prefer remaining mission bases over AA.
  for (const t of targets)
    if (t.alive && t.type === 'bomber') {
      const f = m.spec.battlefield.flights.find((f) => f.side === t.coalition);
      if (!targets.some((a) => a.id === t.aiTargetId && a.alive))
        t.aiTargetId = f?.attack.find((id) => targets.some((a) => a.id === id && a.alive));
    }
}
const lost = (t) => !t.alive && !t.pending && !t.exited && !t.retired;
export function battlefieldCondition(rule, targets, s) {
  if (rule.all) return rule.all.every((r) => battlefieldCondition(r, targets, s));
  if (rule.any) return rule.any.some((r) => battlefieldCondition(r, targets, s));
  if (rule.survive)
    return targets.filter((t) => rule.survive.includes(t.id) && t.alive).length >= rule.min;
  if (rule.destroy) return rule.destroy.every((id) => targets.some((t) => t.id === id && lost(t)));
  if (rule.eliminateAir) {
    const air = targets.filter((t) => t.coalition === rule.eliminateAir && t.kind === 'air');
    const includesPlayer =
      (s.coalition || (s.spec.faction === 'west' ? 'west' : 'east')) === rule.eliminateAir;
    return air.length > 0 && air.every(lost) && (!includesPlayer || s.dying || s.crashed);
  }
  return false;
}
export function battlefieldObjectives(m, s, targets, w) {
  const side = m.spec.side || 'west',
    opponent = side === 'west' ? 'east' : 'west',
    config = m.spec.battlefield;
  const won = battlefieldCondition(config.victory[side], targets, s),
    lostBattle = battlefieldCondition(config.victory[opponent], targets, s);
  const defendedBases = config.assets
    .filter((a) => a.side === side && ['airbase', 'carrier'].includes(a.type))
    .map((a) => a.id);
  const incoming = w.projectiles?.some(
    (p) =>
      p.owner === 'enemy' &&
      targets.some((t) => t.alive && defendedBases.includes(t.id) && t.id === p.targetEntityId),
  );
  const rows = config.reports[side].map((report) => {
    const air = targets.filter((t) => t.coalition === report.air && t.kind === 'air');
    const assets = targets.filter((t) => report.assets?.includes(t.id));
    const values = {
      alive: assets.filter((t) => t.alive).length,
      total: assets.length,
      destroyed: assets.filter(lost).length,
      airLost: air.filter(lost).length,
      airTotal: air.length,
      wave: m.wave || 1,
    };
    return {
      id: report.id,
      text: report.text.replace(/\{(\w+)\}/g, (_, key) => values[key]),
      optional: !!report.optional,
      done: battlefieldCondition(report.condition, targets, s),
    };
  });
  return {
    complete: won && !(config.waitForThreats?.includes(side) && incoming),
    failure: lostBattle ? 'Az ellenfél teljesítette a győzelmi feltételeket.' : '',
    rows,
  };
}
