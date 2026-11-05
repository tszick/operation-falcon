import {
  createRoomAI,
  planRoomAI,
  roomAIInput,
  finishRoomAI,
  roomAIStatus,
} from './multiplayer-ai.mjs';
import { Weapons } from '../src/weapons.js';
import { Targeting } from '../src/targeting.js';
import { Vec3, forward, right, up } from '../src/math.js';
import { terrainHeight, withTerrainSnapshot } from '../src/terrain.js';
import { stepAircraft } from '../src/physics.js';
import { spawnAircraft } from '../src/multiplayer/flightState.js';
import { armament } from '../src/armament.js';
import { firingStatus } from '../src/firingStatus.js';
import { deployCountermeasures, updateCountermeasures } from '../src/countermeasures.js';
import { PROJECTILE_LIMIT, EVENT_LIMIT } from '../src/multiplayer/protocol.js';
import { packProjectile, packTarget } from '../src/multiplayer/combatState.js';
export function playerEntity(p) {
  const s = p.state;
  return {
    id: p.id,
    type: 'fighter',
    kind: 'air',
    team: 'ally',
    aircraftId: s.spec.id,
    displayCallSign: p.callSign,
    position: s.position,
    previousPosition: s.previousPosition,
    velocity: s.velocity,
    flight: s,
    alive: !s.dying && !s.crashed,
    falling: s.dying && !s.crashed,
    radius: 28,
    threats: [],
  };
}
export function createRoomCombat(world, scenario = 'range') {
  return withTerrainSnapshot(world, () => {
    const flight = spawnAircraft('mig29', 0, world.skySeed ^ 771);
    flight.position = new Vec3(0, 3000, -4000);
    const ai = scenario !== 'range' ? createRoomAI(world) : null;
    return {
      ai,
      weapons: new Weapons({ actorUpdates: false, friendlyFire: true }),
      eventSequence: 0,
      events: [],
      targets: [
        {
          rangeTarget: true,
          id: 'RANGE-AIR',
          name: 'Fegyvertelen légi cél',
          type: 'fighter',
          kind: 'air',
          team: 'enemy',
          aircraftId: 'mig29',
          flight,
          position: flight.position,
          velocity: flight.velocity,
          alive: true,
          radius: 28,
          threats: [],
        },
        {
          rangeTarget: true,
          id: 'RANGE-GROUND',
          name: 'Lőtéri teherautó',
          type: 'truck',
          kind: 'ground',
          team: 'enemy',
          position: new Vec3(600, terrainHeight(600, -3000), -3000),
          velocity: new Vec3(),
          heading: 0,
          alive: true,
          radius: 12,
          health: 100,
          maxHealth: 100,
          damage: 0,
          threats: [],
        },
        ...(ai?.units || []),
      ].filter((t) => scenario !== 'cooperative' || t.id !== 'RANGE-AIR'),
    };
  });
}
export function createPlayerCombat() {
  const weapons = new Weapons({ actorUpdates: false });
  weapons.selected = 'gun';
  return { weapons, aim: new Targeting(), feedback: '', hits: 0, kills: 0, friendlyHits: 0 };
}
function recordEvent(room, event, time) {
  const allowed = [
    'type',
    'weapon',
    'sourceId',
    'targetId',
    'projectileId',
    'profile',
    'part',
    'engineIndex',
    'amount',
    'destroyed',
    'ground',
    'heavy',
    'friendlyFire',
    'reason',
    'kind',
    'owner',
    'distanceM',
    'radarRangeM',
    'launchRangeM',
    'nominalRangeM',
  ];
  const data = { id: ++room.combat.eventSequence, time };
  for (const key of allowed) if (event[key] !== undefined) data[key] = event[key];
  for (const key of ['position', 'initialVelocity']) if (event[key]) data[key] = { ...event[key] };
  room.combat.events.push(data);
  if (room.combat.events.length > EVENT_LIMIT) room.combat.events.shift();
}
function transferFire(room, player, time) {
  const personal = player.combat.weapons,
    shared = room.combat.weapons,
    ids = new Map();
  for (const p of personal.projectiles) {
    const id = ++shared.sequence;
    ids.set(p.id, id);
    p.id = id;
    p.sourceId = player.id;
    p.owner = 'ally';
    p.targetEntityId = p.targetId;
    shared.projectiles.push(p);
  }
  personal.projectiles = [];
  // Fire events create world-space flashes in both clients, not on each client's own nose.
  personal.effects = [];
  for (const event of personal.drainEvents()) {
    if (ids.has(event.projectileId)) event.projectileId = ids.get(event.projectileId);
    event.sourceId = player.id;
    if (event.type === 'gun')
      event.position = player.state.position
        .clone()
        .add(forward(player.state.orientation).scale(12))
        .add(right(player.state.orientation).scale(-1))
        .add(up(player.state.orientation).scale(-0.6));
    recordEvent(room, event, time);
  }
}
export function stepRoomCombat(room, commands, dt) {
  const shared = room.combat.weapons,
    players = [...room.players.values()],
    time = (room.tick + 1) * dt;
  if (!players.length) return;
  planRoomAI(room, players.map(playerEntity), dt);
  for (const t of room.combat.targets)
    if (t.flight && !t.flight.crashed && !t.exited) {
      stepAircraft(t.flight, roomAIInput(room, t, dt), dt);
      finishRoomAI(t, dt);
      Object.assign(t, {
        previousPosition: t.flight.previousPosition,
        position: t.flight.position,
        velocity: t.flight.velocity,
        damage: t.flight.damage,
        alive: !t.exited && !t.flight.dying && !t.flight.crashed,
        falling: !t.exited && t.flight.dying && !t.flight.crashed,
      });
      if (t.flight.impactPending) {
        t.impactReady = true;
        t.flight.impactPending = false;
      }
    }
  const targets = [...room.combat.targets, ...players.map(playerEntity)];
  for (const player of players) {
    const { state: s, combat } = player,
      controls = commands.get(player.id)?.combat;
    updateCountermeasures(s, dt);
    combat.weapons.cooldown = Math.max(0, combat.weapons.cooldown - dt);
    combat.weapons.gunHeat = Math.max(0, combat.weapons.gunHeat - dt * 0.5);
    if (controls && armament(s.spec).weapons[controls.weapon])
      combat.weapons.selected = controls.weapon;
    if (controls?.cycle) combat.aim.cycle(s, targets);
    combat.aim.update(s, targets, dt);
    if (controls?.countermeasures) deployCountermeasures(s);
    if (controls?.fire && shared.projectiles.length < PROJECTILE_LIMIT)
      combat.weapons.fire(s, targets, combat.aim);
    combat.feedback = firingStatus(s, targets, combat.aim, combat.weapons).label;
    transferFire(room, player, time);
    if (s.impactPending) {
      s.impactPending = false;
      shared.explode(s.position, 'bomb', { ground: true });
    }
  }
  shared.update(players[0].state, targets, dt);
  for (const player of players) {
    player.state.incomingMissiles = shared.projectiles.filter(
      (p) =>
        p.type === 'aam' &&
        p.targetEntityId === player.id &&
        !p.seekerLost &&
        p.decoyId === undefined,
    ).length;
  }
  for (const event of shared.drainEvents()) {
    const player = room.players.get(event.sourceId);
    if (event.type === 'target-hit' && player) {
      if (event.friendlyFire) player.combat.friendlyHits++;
      else {
        player.combat.hits++;
        if (event.destroyed) player.combat.kills++;
      }
    }
    recordEvent(room, event, time);
  }
  // The solver owns hit decisions; clients build cosmetic particles from these bounded events.
  for (const e of shared.effects)
    if (e.kind === 'impact' && e.age === 0)
      recordEvent(room, { type: 'impact', position: e.position }, time);
}
export function playerCombatSnapshot(player) {
  const { weapons, aim, feedback, hits, kills, friendlyHits } = player.combat;
  return {
    selected: weapons.selected,
    cooldown: weapons.cooldown,
    gunHeat: weapons.gunHeat,
    aim: { id: aim.id, progress: aim.progress, locked: aim.locked },
    feedback,
    hits,
    kills,
    friendlyHits,
  };
}
export function roomCombatSnapshot(room) {
  return {
    ai: roomAIStatus(room),
    targets: room.combat.targets.map(packTarget),
    projectiles: room.combat.weapons.projectiles.map(packProjectile),
    events: room.combat.events.slice(),
    eventSequence: room.combat.eventSequence,
  };
}
