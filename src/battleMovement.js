import { guidedFlightInput } from './aiDefense.js';
import { Vec3, clamp } from './math.js';
import { convoyPose, stopAtBrokenBridge } from './terrain.js';
export function moveConvoy(t, targets, dt) {
  const direction = t.routeDirection || 1,
    previous = t.position.clone(),
    routeStart = t.routeDistance || 0;
  if (t.routeMode === 'bridge') {
    const bridge = targets.find((u) => u.id === t.bridgeId),
      stop = -(bridge?.radius || 100) - 100;
    if (bridge && !bridge.alive && t.routeDistance >= stop) t.stopped = true;
    if (!t.stopped) t.routeDistance += 14 * dt;
    if (bridge && !bridge.alive && t.routeDistance > stop) {
      t.routeDistance = stop;
      t.stopped = true;
    }
    if (bridge?.alive && t.routeDistance > (bridge.radius || 100) + 120) t.crossedBridge = true;
  } else if (t.routeMode === 'base-attack') {
    t.routeDistance = Math.max(1200, t.routeDistance - 14 * dt);
    t.stopped = t.routeDistance <= 1200;
  } else {
    t.routeDistance = (t.routeDistance || 0) + 14 * dt * direction;
    if (Math.abs(t.routeDistance) > 2200) {
      t.routeDistance = clamp(t.routeDistance, -2200, 2200);
      t.routeDirection = -direction;
    }
  }
  const roadEnd = stopAtBrokenBridge(routeStart, t.routeDistance);
  if (roadEnd !== t.routeDistance) t.stopped = true;
  t.routeDistance = roadEnd;
  Object.assign(t, convoyPose(t));
  t.velocity = t.position
    .clone()
    .sub(previous)
    .scale(1 / Math.max(dt, 1e-6));
}
export function moveEscort(t, dt) {
  const desired = Math.atan2(
      (t.routeX ?? t.position.x) - t.position.x,
      (t.exitZ ?? t.position.z + 12000) - t.position.z,
    ),
    error = Math.atan2(Math.sin(desired - (t.heading || 0)), Math.cos(desired - (t.heading || 0))),
    speed = t.cruiseSpeed || 125,
    turn = clamp(error, -0.035 * dt, 0.035 * dt);
  t.heading = (t.heading || 0) + turn;
  t.bank = Math.atan((speed * turn) / (dt * 9.81));
  t.velocity = new Vec3(
    Math.sin(t.heading) * speed,
    clamp(((t.routeAltitude ?? 1700) - t.position.y) * 0.025, -8, 10),
    Math.cos(t.heading) * speed,
  );
  t.position.add(t.velocity.clone().scale(dt));
  if (t.position.z >= t.exitZ) {
    t.exited = true;
    t.alive = false;
    t.velocity = new Vec3();
  }
}

export function escortFlightInput(t) {
  t.routeX ??= t.position.x;
  return guidedFlightInput(
    t,
    new Vec3(t.routeX, t.routeAltitude ?? 1700, t.exitZ ?? t.position.z + 12000),
    { altitude: t.routeAltitude ?? 1700, bankLimit: (20 * Math.PI) / 180 },
  );
}
