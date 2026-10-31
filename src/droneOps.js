import { Vec3, clamp } from './math.js';
import { terrainHeight } from './terrain.js';
import { unitDefinition } from './unitTypes.js';
import { mobileRules as rules } from './mobileUnitData.js';

export function launchDrone(controller, target) {
  const serial = (controller.droneSerial = (controller.droneSerial || 0) + 1),
    position = controller.position.clone().add(new Vec3(serial % 2 ? -4 : 4, 35, 0)),
    def = unitDefinition('attack-drone');
  return {
    id: controller.id + '-DRONE-' + serial,
    type: 'attack-drone',
    kind: 'air',
    name: def.name,
    team: controller.team,
    faction: controller.faction,
    alive: true,
    health: def.health,
    maxHealth: def.health,
    damage: 0,
    position,
    previousPosition: position.clone(),
    velocity: new Vec3(),
    radius: 1.4,
    heading: Math.atan2(target.position.x - position.x, target.position.z - position.z),
    pitch: 0,
    threats: [],
    aiTargetId: target.id,
    controllerId: controller.id,
    drone: { age: 0, travelled: 0, damage: rules.droneDamage },
  };
}
export function moveAttackDrone(t, targets, dt) {
  const target = targets.find(
    (a) =>
      a.id === t.aiTargetId &&
      a.alive &&
      a.kind === 'ground' &&
      a.team !== t.team &&
      a.team !== 'neutral',
  );
  t.drone.age += dt;
  if (!target || t.drone.age > rules.droneEndurance || t.drone.travelled >= rules.droneRange) {
    t.alive = false;
    t.expired = true;
    return;
  }
  const delta = target.position.clone().sub(t.position),
    horizontal = Math.hypot(delta.x, delta.z),
    terminal = horizontal < 1500,
    speed = terminal ? rules.droneSprint : rules.droneCruise,
    distance = delta.length();
  if (distance <= Math.max(15, speed * dt)) {
    t.position = target.position.clone();
    t.alive = false;
    t.impacted = true;
    t.impactReady = true;
    return;
  }
  const direction = new Vec3(delta.x, 0, delta.z).normalize(),
    look = t.position.clone().add(direction.clone().scale(700)),
    height = terminal
      ? target.position.y
      : Math.max(terrainHeight(t.position.x, t.position.z), terrainHeight(look.x, look.z)) + 140,
    vertical = clamp((height - t.position.y) * 0.4, terminal ? -25 : -6, 8);
  t.velocity = direction.scale(Math.sqrt(Math.max(0, speed * speed - vertical * vertical)));
  t.velocity.y = vertical;
  t.position.add(t.velocity.clone().scale(dt));
  t.drone.travelled += t.velocity.length() * dt;
  t.heading = Math.atan2(t.velocity.x, t.velocity.z);
  t.pitch = Math.atan2(t.velocity.y, Math.hypot(t.velocity.x, t.velocity.z));
  if (t.position.y < terrainHeight(t.position.x, t.position.z)) {
    t.alive = false;
    t.impactReady = true;
    t.expired = true;
  }
}
export function updateDroneOperations(s, m, targets, w) {
  if (m.complete || m.failed || s.crashed || s.dying || w.missionEnded) return;
  for (const t of targets.filter((a) => a.type === 'drone-command' && a.alive && !a.exited)) {
    t.droneStock ??= rules.droneStock;
    t.nextDroneLaunch ??= rules.droneFirstLaunch;
    const active = targets.filter(
      (a) => a.type === 'attack-drone' && a.controllerId === t.id && a.alive,
    );
    if (w.enemyFire === false || !t.droneStock || active.length || s.elapsed < t.nextDroneLaunch)
      continue;
    const assigned = targets.find((a) => a.id === t.aiTargetId),
      eligible = (a) =>
        a?.alive &&
        a.kind === 'ground' &&
        a.team !== t.team &&
        a.team !== 'neutral' &&
        a.position.distance(t.position) <= rules.droneRange,
      target = eligible(assigned)
        ? assigned
        : targets
            .filter(eligible)
            .sort((a, b) => t.position.distance(a.position) - t.position.distance(b.position))[0];
    if (!target) continue;
    const count = Math.min(
      t.droneStock,
      rules.droneActiveLimit,
      clamp(Math.trunc(t.droneSalvo || 2), 1, 2),
    );
    for (let i = 0; i < count; i++) {
      const drone = launchDrone(t, target);
      targets.push(drone);
      t.droneStock--;
      w.emit?.({
        type: 'drone-launch',
        sourceId: t.id,
        targetId: target.id,
        droneId: drone.id,
        owner: t.team,
        remaining: t.droneStock,
        time: s.elapsed,
        position: drone.position.clone(),
      });
    }
    t.nextDroneLaunch = s.elapsed + rules.droneReload;
  }
  for (const t of targets.filter((a) => a.type === 'attack-drone')) {
    if (t.impacted && !t.impactApplied) {
      t.impactApplied = true;
      const target = targets.find(
        (a) =>
          a.id === t.aiTargetId &&
          a.alive &&
          a.kind === 'ground' &&
          a.team !== t.team &&
          a.team !== 'neutral',
      );
      if (target && t.position.distance(target.position) < 35) {
        target.health = Math.max(0, target.health - t.drone.damage);
        target.damage = 100 * (1 - target.health / target.maxHealth);
        if (target.health === 0) {
          target.alive = false;
          target.impactReady = true;
        }
        w.emit?.({
          type: 'drone-impact',
          sourceId: t.controllerId,
          droneId: t.id,
          targetId: target.id,
          damage: t.drone.damage,
          time: s.elapsed,
          position: t.position.clone(),
        });
      }
    }
    // Keep telemetry bounded in long missions while retaining dead drones briefly for effects/logs.
    if (!t.alive) t.drone.finishedAt ??= s.elapsed;
  }
  for (let i = targets.length - 1; i >= 0; i--)
    if (
      targets[i].type === 'attack-drone' &&
      !targets[i].alive &&
      s.elapsed - targets[i].drone.finishedAt > 30
    )
      targets.splice(i, 1);
}
