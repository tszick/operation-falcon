import { Vec3 } from './math.js';
import { terrainWorld, pathPoint, pathCoordinates, pathHeading } from './terrain.js';
import { unitDefinition } from './unitTypes.js';
// Find centre-line intersections once after the mission has finished laying out its roads.
export function roadRiverCrossings(path, river, min = -90000, max = 90000) {
  const start = Math.max(min, path.min ?? min),
    end = Math.min(max, path.max ?? max),
    roots = [];
  const across = (t) => {
    const p = pathPoint(path, t);
    return pathCoordinates(river, p.x, p.z).across;
  };
  let a = start,
    fa = across(a);
  for (let b = Math.min(a + 100, end); a < end; b = Math.min(b + 100, end)) {
    const fb = across(b);
    if (fa * fb <= 0 && (fa !== 0 || fb !== 0)) {
      let lo = a,
        hi = b,
        flo = fa;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2,
          f = across(mid);
        if (flo * f <= 0) hi = mid;
        else {
          lo = mid;
          flo = f;
        }
      }
      const along = (lo + hi) / 2,
        p = pathPoint(path, along);
      if (
        (path.min !== undefined || Math.hypot(p.x, p.z) >= 4500) &&
        !roots.some((r) => Math.abs(r.along - along) < 1)
      ) {
        // Measure to both banks along the road, rather than assuming a right-angle crossing.
        const bank = (direction) => {
          let t = along;
          for (let i = 0; i < 6000 && Math.abs(across(t)) < river.width / 2 + 35; i++)
            t += direction * 10;
          return t;
        };
        const from = bank(-1),
          to = bank(1);
        if (from >= start && to <= end)
          roots.push({
            along,
            from,
            to,
            x: p.x,
            z: p.z,
            span: to - from,
            heading: pathHeading(path, along),
            deckY: river.level + 16.1,
          });
      }
    }
    a = b;
    fa = fb;
  }
  return roots;
}
export function attachRoadBridges(targets) {
  if (!terrainWorld.river) {
    terrainWorld.bridges = [];
    return targets;
  }
  const paths = [
    ['road', terrainWorld.road],
    ...(terrainWorld.cityRoads || []).map((p, i) => ['city-road-' + i, p]),
  ];
  const previous = terrainWorld.bridges || [],
    bridges = [];
  for (const [pathKey, path] of paths) {
    if (!path) continue;
    path.bridgeKey = pathKey;
    for (const crossing of roadRiverCrossings(path, terrainWorld.river)) {
      const generatedId = `ROAD-BRIDGE-${pathKey}-${bridges.length + 1}`;
      const existing = targets.find(
        (t) =>
          t.type === 'bridge' &&
          (t.id === generatedId ||
            Math.hypot(t.position.x - crossing.x, t.position.z - crossing.z) < 2),
      );
      const primary = existing && !existing.incidental;
      const bridge = {
        ...crossing,
        pathKey,
        width: Math.max(20, path.width + 6),
        alive: existing?.alive !== false,
      };
      if (primary) {
        bridge.span = terrainWorld.bridge?.span || crossing.span;
        bridge.from = bridge.along - bridge.span / 2;
        bridge.to = bridge.along + bridge.span / 2;
        bridge.deckY = existing.position.y + 2.1;
      }
      if (!primary) {
        const a = pathPoint(path, bridge.from),
          b = pathPoint(path, bridge.to);
        bridge.along = (bridge.from + bridge.to) / 2;
        bridge.x = (a.x + b.x) / 2;
        bridge.z = (a.z + b.z) / 2;
        bridge.heading = Math.atan2(b.x - a.x, b.z - a.z);
        bridge.span = Math.hypot(b.x - a.x, b.z - a.z);
      }
      bridge.id = existing?.id || generatedId;
      let target = existing;
      if (!target) {
        const def = unitDefinition('bridge');
        target = {
          id: bridge.id,
          type: 'bridge',
          kind: 'ground',
          team: 'neutral',
          faction: 'neutral',
          name: def.name,
          role: def.role,
          threats: [],
          incidental: true,
          alive: true,
          health: def.health,
          maxHealth: def.health,
          position: new Vec3(bridge.x, bridge.deckY - 2.1, bridge.z),
          velocity: new Vec3(),
          heading: bridge.heading,
          radius: bridge.span / 2,
        };
        target.previousPosition = target.position.clone();
        targets.push(target);
      }
      Object.assign(target, {
        bridgeId: bridge.id,
        bridgeSpan: bridge.span,
        bridgeWidth: bridge.width,
      });
      bridges.push(bridge);
    }
  }
  terrainWorld.bridges = bridges;
  if (JSON.stringify(previous) !== JSON.stringify(bridges))
    terrainWorld.bridgeRevision = (terrainWorld.bridgeRevision || 0) + 1;
  return targets;
}
export function destroyRoadBridge(target) {
  const bridge = terrainWorld.bridges?.find((b) => b.id === (target.bridgeId || target.id));
  if (bridge?.alive) {
    bridge.alive = false;
    terrainWorld.bridgeRevision = (terrainWorld.bridgeRevision || 0) + 1;
  }
}
