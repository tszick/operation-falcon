import { Vec3, Quat } from '../src/math.js';
import { NETWORK_STEP, ROOM_CAPACITY } from '../src/multiplayer/protocol.js';
export function createRoomMission(scenario, assignment = 'strike') {
  if (scenario === 'arena')
    return {
      phase: 'waiting',
      assignment: 'arena',
      elapsedTicks: 0,
      endedAt: null,
      reason: null,
      participants: [],
      stage: 'combat',
      objectives: [],
      winnerId: null,
    };
  return scenario === 'cooperative'
    ? {
        phase: 'waiting',
        assignment,
        elapsedTicks: 0,
        endedAt: null,
        reason: null,
        participants: [],
        stage: 'combat',
        objectives:
          assignment === 'defend-base'
            ? [
                { id: 'base', status: 'pending', optional: false },
                { id: 'attackers', status: 'pending', optional: false },
                { id: 'landing', status: 'pending', optional: false },
                { id: 'survival', status: 'pending', optional: true },
              ]
            : [
                { id: 'fighter', status: 'pending', optional: false },
                { id: 'ground', status: 'pending', optional: assignment === 'intercept' },
                { id: 'survival', status: 'pending', optional: true },
              ],
      }
    : null;
}
export function startRoomMission(room) {
  const mission = room.mission;
  if (
    !mission ||
    mission.phase !== 'waiting' ||
    room.players.size < 2 ||
    room.players.size > ROOM_CAPACITY ||
    ![...room.players.values()].every((p) => p.ready)
  )
    return false;
  mission.participants = [...room.players.values()].map((p) => ({
    id: p.id,
    callSign: p.callSign,
    present: true,
    health: 100,
    lost: false,
    hits: 0,
    kills: 0,
    friendlyHits: 0,
    returned: false,
    eliminatedAt: null,
  }));
  // Commands sent while waiting cannot become a held action at takeoff.
  for (const p of room.players.values()) {
    p.queue.length = 0;
    p.ack = p.received;
  }
  if (room.scenario === 'arena') positionArena(room);
  mission.phase = 'active';
  return true;
}
export function roomSimulating(room) {
  return !room.mission || room.mission.phase === 'active';
}
function finish(mission, phase, reason) {
  mission.phase = phase;
  mission.reason = reason;
  mission.endedAt = mission.elapsedTicks * NETWORK_STEP;
  for (const objective of mission.objectives)
    if (objective.status === 'pending')
      objective.status = phase === 'success' && objective.id === 'survival' ? 'complete' : 'failed';
}
export function updateRoomMission(room) {
  const mission = room.mission;
  if (!mission || mission.phase !== 'active') return;
  for (const participant of mission.participants) {
    const p = room.players.get(participant.id);
    participant.present = !!p?.connected;
    if (!p) {
      participant.lost = true;
      continue;
    }
    participant.lost ||= p.state.dying || p.state.crashed;
    if (p.state.crashed) participant.eliminatedAt ??= mission.elapsedTicks * NETWORK_STEP;
    participant.health = Math.max(0, 100 - p.state.damage);
    participant.hits = p.combat.hits;
    participant.kills = p.combat.kills;
    participant.friendlyHits = p.combat.friendlyHits;
  }
  if (mission.assignment === 'arena') {
    const survivors = [...room.players.values()].filter((p) => !p.state.crashed);
    if (survivors.length === 0 || (survivors.length === 1 && !survivors[0].state.dying)) {
      mission.winnerId = survivors[0]?.id || null;
      finish(
        mission,
        survivors.length ? 'success' : 'failed',
        survivors.length ? 'last-survivor' : 'draw',
      );
    }
    return;
  }
  if (mission.assignment === 'defend-base') {
    updateDefenseObjectives(room);
  } else {
    const fighter = room.combat.targets.find((t) => t.id === 'HOSTILE-ONE');
    const ground = room.combat.targets.find((t) => t.id === 'RANGE-GROUND');
    if (fighter && (!fighter.alive || fighter.exited)) mission.objectives[0].status = 'complete';
    if (ground && !ground.alive) mission.objectives[1].status = 'complete';
  }
  if (mission.participants.some((p) => p.lost))
    mission.objectives.find((o) => o.id === 'survival').status = 'failed';
  if (mission.phase !== 'active') return;
  const pilots = [...room.players.values()];
  // A dying pilot may still watch the physical fall; failure waits for impact.
  if (!pilots.some((p) => !p.state.crashed)) finish(mission, 'failed', 'pilots-lost');
  else if (
    mission.objectives.filter((o) => !o.optional).every((o) => o.status === 'complete') &&
    pilots.some((p) => !p.state.dying && !p.state.crashed)
  )
    finish(
      mission,
      'success',
      mission.assignment === 'defend-base' ? 'base-defended-and-landed' : 'targets-neutralized',
    );
}
export function roomMissionSnapshot(room) {
  const mission = room.mission;
  return mission
    ? {
        winnerId: mission.winnerId || null,
        phase: mission.phase,
        assignment: mission.assignment,
        stage: mission.stage,
        ...(mission.defense ? { defense: { ...mission.defense } } : {}),
        elapsed: mission.elapsedTicks * NETWORK_STEP,
        endedAt: mission.endedAt,
        reason: mission.reason,
        objectives: mission.objectives.map((o) => ({ ...o })),
        participants: mission.participants.map((p) => ({ ...p })),
      }
    : null;
}

function updateDefenseObjectives(room) {
  const m = room.mission,
    base = room.combat.targets.find((t) => t.id === 'BASE');
  const attackers = room.combat.targets.filter((t) => t.team === 'enemy' && t.kind === 'air');
  const neutralized = attackers.filter((t) => !t.alive || t.exited).length;
  const incoming = room.combat.weapons.projectiles.some(
    (p) => p.owner === 'enemy' && p.targetEntityId === 'BASE',
  );
  m.defense = {
    baseHealth: Math.round(
      (Math.max(0, base?.health || 0) / Math.max(1, base?.maxHealth || 1)) * 100,
    ),
    neutralized,
    total: attackers.length,
    incoming,
  };
  const goal = (id) => m.objectives.find((o) => o.id === id);
  if (!base?.alive) {
    goal('base').status = 'failed';
    finish(m, 'failed', 'base-destroyed');
    return;
  }
  const clear = attackers.length > 0 && neutralized === attackers.length && !incoming;
  if (clear) {
    goal('base').status = 'complete';
    goal('attackers').status = 'complete';
    m.stage = 'return';
  }
  const survivors = [...room.players.values()].filter((p) => !p.state.dying && !p.state.crashed);
  for (const participant of m.participants) {
    const p = room.players.get(participant.id),
      s = p?.state;
    participant.returned = !!(
      clear &&
      s &&
      !participant.lost &&
      s.onGround &&
      s.landing?.success &&
      s.velocity.length() < 3 &&
      Math.abs(s.position.x) < 65 &&
      Math.abs(s.position.z) < 1800
    );
  }
  if (
    clear &&
    survivors.length &&
    survivors.every((p) => m.participants.find((q) => q.id === p.id).returned)
  )
    goal('landing').status = 'complete';
}

function positionArena(room) {
  const players = [...room.players.values()];
  players.forEach((p, i) => {
    const angle = (i * Math.PI * 2) / players.length;
    const s = p.state,
      trim = Math.asin(s.orientation.rotate(new Vec3(0, 0, 1)).y);
    s.position = new Vec3(Math.sin(angle) * 7000, 3200, Math.cos(angle) * 7000);
    s.previousPosition = s.position.clone();
    s.orientation = Quat.euler(angle + Math.PI, trim, 0);
    s.velocity = new Vec3(-Math.sin(angle) * 180, 0, -Math.cos(angle) * 180);
    s.team = p.id;
  });
}
