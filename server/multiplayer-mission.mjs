import { NETWORK_STEP, ROOM_CAPACITY } from '../src/multiplayer/protocol.js';
export function createRoomMission(scenario, assignment = 'strike') {
  return scenario === 'cooperative'
    ? {
        phase: 'waiting',
        assignment,
        elapsedTicks: 0,
        endedAt: null,
        reason: null,
        participants: [],
        objectives: [
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
    room.players.size !== ROOM_CAPACITY ||
    ![...room.players.values()].every((p) => p.ready)
  )
    return;
  mission.participants = [...room.players.values()].map((p) => ({
    id: p.id,
    callSign: p.callSign,
    present: true,
    health: 100,
    lost: false,
    hits: 0,
    kills: 0,
    friendlyHits: 0,
  }));
  // Commands sent while waiting cannot become a held action at takeoff.
  for (const p of room.players.values()) {
    p.queue.length = 0;
    p.ack = p.received;
  }
  mission.phase = 'active';
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
    participant.present = !!p;
    if (!p) {
      participant.lost = true;
      continue;
    }
    participant.lost ||= p.state.dying || p.state.crashed;
    participant.health = Math.max(0, 100 - p.state.damage);
    participant.hits = p.combat.hits;
    participant.kills = p.combat.kills;
    participant.friendlyHits = p.combat.friendlyHits;
  }
  const fighter = room.combat.targets.find((t) => t.id === 'HOSTILE-ONE');
  const ground = room.combat.targets.find((t) => t.id === 'RANGE-GROUND');
  if (fighter && (!fighter.alive || fighter.exited)) mission.objectives[0].status = 'complete';
  if (ground && !ground.alive) mission.objectives[1].status = 'complete';
  if (mission.participants.some((p) => p.lost)) mission.objectives[2].status = 'failed';
  const pilots = [...room.players.values()];
  // A dying pilot may still watch the physical fall; failure waits for impact.
  if (!pilots.some((p) => !p.state.crashed)) finish(mission, 'failed', 'pilots-lost');
  else if (
    mission.objectives.filter((o) => !o.optional).every((o) => o.status === 'complete') &&
    pilots.some((p) => !p.state.dying && !p.state.crashed)
  )
    finish(mission, 'success', 'targets-neutralized');
}
export function roomMissionSnapshot(room) {
  const mission = room.mission;
  return mission
    ? {
        phase: mission.phase,
        assignment: mission.assignment,
        elapsed: mission.elapsedTicks * NETWORK_STEP,
        endedAt: mission.endedAt,
        reason: mission.reason,
        objectives: mission.objectives.map((o) => ({ ...o })),
        participants: mission.participants.map((p) => ({ ...p })),
      }
    : null;
}
