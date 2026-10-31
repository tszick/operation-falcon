import { dubinsPath, landingRouteColor } from './landingRoute.js';
import { refuellingStation } from './aerialRefuelling.js';
import { Vec3, Quat, forward, right, up, attitude, clamp, DEG } from './math.js';
import { terrainHeight } from './terrain.js';
const cache = new WeakMap();

export function toggleRefuellingRoute(s) {
  s.refuellingRouteEnabled = !s.refuellingRouteEnabled;
  cache.delete(s);
  return s.refuellingRouteEnabled;
}

export function getRefuellingRoute(s, targets, { jammed = false } = {}) {
  const tanker = targets.find(
    (t) => t.id === 'TANKER' && t.team === 'ally' && t.alive && !t.exited && !t.falling,
  );
  if (
    !s.refuellingRouteEnabled ||
    !s.aerialRefuel ||
    s.onGround ||
    s.crashed ||
    s.dying ||
    jammed ||
    !tanker
  ) {
    cache.delete(s);
    return null;
  }
  const key = [
    s.elapsed,
    ...[s.position, tanker.position].flatMap((p) => [p.x, p.y, p.z]),
    tanker.heading,
    tanker.bank,
  ].join(':');
  const previous = cache.get(s);
  if (previous?.key === key) return previous.route;
  const q =
      tanker.flight?.orientation ||
      Quat.euler(tanker.heading || 0, tanker.pitch || 0, tanker.bank || 0),
    station = refuellingStation(tanker),
    direction = forward(q),
    entryDistance = clamp(station.distance(s.position) * 0.25, 500, 3000),
    entry = station.clone().sub(direction.clone().scale(entryDistance)),
    velocity = s.velocity,
    heading =
      Math.hypot(velocity.x, velocity.z) > 3
        ? Math.atan2(velocity.x, velocity.z)
        : attitude(s.orientation).heading,
    endHeading = Math.atan2(direction.x, direction.z),
    toStation = station.clone().sub(s.position),
    behind = toStation.dot(direction),
    lateral = Math.abs(toStation.dot(right(q))),
    aligned =
      behind >= -10 &&
      behind < 3000 &&
      lateral < 150 &&
      forward(s.orientation).dot(direction) > Math.cos(20 * DEG),
    speed = Math.max(60, Math.hypot(velocity.x, velocity.z)),
    radius = clamp((speed * speed) / (9.81 * Math.tan(30 * DEG)), 800, 12000);
  let points = [],
    finalStart = 0;
  if (!aligned) {
    const path = dubinsPath(s.position, heading, entry, endHeading, radius);
    if (!path) return null;
    let travelled = 0;
    points = path.points.map((p, i) => {
      if (i) travelled += p.distance(path.points[i - 1]);
      const fraction = clamp(travelled / Math.max(1, path.total), 0, 1),
        height = s.position.y + (entry.y - s.position.y) * fraction;
      return new Vec3(p.x, Math.max(height, terrainHeight(p.x, p.z) + 120), p.z);
    });
    finalStart = points.length;
  }
  const start = aligned ? s.position : entry,
    length = start.distance(station),
    segments = Math.max(1, Math.ceil(length / 100));
  for (let i = 0; i <= segments; i++)
    points.push(
      start.clone().add(
        station
          .clone()
          .sub(start)
          .scale(i / segments),
      ),
    );
  // Pin the moving endpoint exactly to the same contact point used by fuel transfer.
  points[points.length - 1] = station;
  const route = {
    points,
    finalStart,
    color: landingRouteColor,
    gateRight: right(q),
    gateUp: up(q),
    tankerId: tanker.id,
  };
  cache.set(s, { key, route });
  return route;
}
