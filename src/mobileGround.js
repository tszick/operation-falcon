import { Vec3 } from './math.js';
import { vehicleGroundPose } from './vehicleGrounding.js';
import { convoyPose, stopAtBrokenBridge } from './terrain.js';
import { unitDefinition } from './unitTypes.js';
export function moveMobileGround(t, targets, dt) {
  const previous = t.position.clone();
  if (t.followId) {
    const leader = targets.find((a) => a.id === t.followId);
    if (leader) {
      const wanted =
        (leader.routeDistance || 0) - (t.followGap || 200) * (leader.routeDirection || 1);
      t.routeDistance = stopAtBrokenBridge(t.routeDistance || 0, wanted);
      t.routeDirection = leader.routeDirection || 1;
      Object.assign(t, convoyPose(t));
      t.stopped = !leader.alive || !!leader.stopped || t.routeDistance !== wanted;
    }
  } else if (t.aiTargetId) {
    const goal = targets.find((a) => a.id === t.aiTargetId && a.alive);
    if (goal) {
      const delta = goal.position.clone().sub(t.position);
      delta.y = 0;
      const distance = delta.length(),
        step = Math.min(Math.max(0, distance - 5000), unitDefinition(t.type).speed * dt);
      if (distance > 0) t.position.add(delta.scale(step / distance));
      t.heading = Math.atan2(goal.position.x - t.position.x, goal.position.z - t.position.z);
      t.stopped = step === 0;
    }
  }
  const pose = vehicleGroundPose(t.position, t.heading || 0);
  t.position = pose.position;
  t.pitch = pose.pitch;
  t.bank = pose.bank;
  t.velocity =
    dt > 0
      ? t.position
          .clone()
          .sub(previous)
          .scale(1 / dt)
      : new Vec3();
}
