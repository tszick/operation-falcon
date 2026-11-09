import { playerEntity } from './multiplayer-combat.mjs';
import { roomAIInput, finishRoomAI } from './multiplayer-ai.mjs';
import { stepAircraft } from '../src/physics.js';
import { aiServiceInput } from '../src/aiResupply.js';
import { airfieldForTarget } from '../src/recoveryAirfields.js';
export function stepTakenOverAircraft(room, player, dt) {
  const t = playerEntity(player),
    s = player.state;
  const home = room.combat.targets.find((t) => t.id === 'BASE' && t.alive);
  let controls;
  if (home && s.onGround && s.landing?.success) {
    // A disconnected pilot on the landing roll needs braking, not a new
    // airborne approach (which would retract the landing gear).
    s.airfield = airfieldForTarget(home);
    t.service = { stage: 'rollout' };
    controls = aiServiceInput(t);
  } else if (
    home &&
    ((s.onGround && !s.landing?.success) || (t.service?.stage === 'takeoff' && s.agl < 150))
  ) {
    s.airfield = airfieldForTarget(home);
    t.service = { stage: 'takeoff' };
    controls = aiServiceInput(t);
  } else if (
    home &&
    (room.mission?.stage === 'return' || t.retreat || (t.service && t.service.stage !== 'takeoff'))
  ) {
    s.airfield = airfieldForTarget(home);
    delete t.retreat;
    if (!t.service || t.service.stage === 'takeoff') t.service = { stage: 'align' };
    controls = aiServiceInput(t);
  } else {
    if (t.service?.stage === 'takeoff' && !s.onGround) delete t.service;
    controls = roomAIInput(room, t, dt);
  }
  stepAircraft(s, controls || {}, dt);
  finishRoomAI(t, dt);
}
