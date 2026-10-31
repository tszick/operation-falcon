import { drawingContext } from './rendering/createBackend.js';
import { tr } from './i18n.js';
import { transportExitPosition } from './transportRole.js';
import { getRefuellingRoute } from './refuellingRoute.js';
import { getLandingRoute } from './landingRoute.js';
import { navigationJammed } from './electronicWarfare.js';
import { attitude, DEG } from './math.js';
import { radarContacts } from './targeting.js';
import { terrainHeight, runway, terrainWorld, pathPoint, pathCoordinates } from './terrain.js';
export const mapZoomLevel = (value) => ([1, 2, 3].includes(value) ? value : 1);
export const nextMapZoom = (value) => (mapZoomLevel(value) % 3) + 1;
export function tacticalMapState(
  s,
  targets,
  { width = 240, height = 240, zoom = s.mapZoom || 1 } = {},
) {
  zoom = mapZoomLevel(zoom);
  const zoomFactor = 2 ** (zoom - 1),
    originX = zoom > 1 ? s.position.x : 0,
    originZ = zoom > 1 ? s.position.z : 0;
  const contacts = radarContacts(s, targets).filter((c) => c.visible && !c.target.home);
  const base = s.approach?.active ? 10000 : 30000,
    jammed = navigationJammed(s, targets),
    landingRoute = getRefuellingRoute(s, targets, { jammed }) || getLandingRoute(s, { jammed });
  const homePoint = s.recoveryExit || s.airfield?.position || { x: 0, z: 0 };
  const reach = Math.max(
    Math.abs(homePoint.x),
    Math.abs(homePoint.z),
    Math.abs(s.position.x),
    Math.abs(s.position.z),
    ...contacts.flatMap((c) => [Math.abs(c.target.position.x), Math.abs(c.target.position.z)]),
    ...(landingRoute?.points || []).flatMap((p) => [Math.abs(p.x), Math.abs(p.z)]),
  );
  const halfExtent =
    (base * 2 ** Math.max(0, Math.ceil(Math.log2(Math.max(1, reach / (base * 0.85)))))) /
    zoomFactor;
  const scale = (Math.min(width, height) / 2 - 12) / halfExtent;
  return {
    halfExtent,
    scale,
    width,
    height,
    zoom,
    zoomFactor,
    originX,
    originZ,
    centerX: width / 2,
    centerY: height / 2,
    jammed,
    landingRoute,
    contacts: contacts.map((c) => ({
      ...c,
      motionHeading:
        Math.hypot(c.target.velocity.x, c.target.velocity.z) > 1
          ? Math.atan2(c.target.velocity.x, c.target.velocity.z)
          : c.target.heading || 0,
    })),
    playerHeading:
      Math.hypot(s.velocity.x, s.velocity.z) > 3
        ? Math.atan2(s.velocity.x, s.velocity.z)
        : attitude(s.orientation).heading,
  };
}
export const mapPoint = (p, map) => ({
  x: (map.centerX ?? 120) + (p.x - (map.originX || 0)) * map.scale,
  y: (map.centerY ?? 120) - (p.z - (map.originZ || 0)) * map.scale,
});
const contourCache = new Map();
function contours(map) {
  const tile = map.halfExtent / 4,
    originX = Math.round(map.originX / tile) * tile,
    originZ = Math.round(map.originZ / tile) * tile,
    pad = Math.ceil(Math.max(map.width, map.height) / 4);
  const key = [map.halfExtent, map.width, map.height, originX, originZ, terrainWorld.revision].join(
    ':',
  );
  const result = (canvas) => ({
    canvas,
    x: (originX - map.originX) * map.scale - pad,
    y: (map.originZ - originZ) * map.scale - pad,
  });
  if (contourCache.has(key)) return result(contourCache.get(key));
  const width = map.width + 2 * pad,
    height = map.height + 2 * pad,
    scale = map.scale,
    centerX = width / 2,
    centerY = height / 2,
    canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = drawingContext(canvas),
    nx = 72,
    nz = Math.ceil((nx * height) / width),
    h = [];
  if (terrainWorld.ocean) {
    for (const island of terrainWorld.islands || []) {
      const x = (island.x - originX) * scale + centerX,
        y = (originZ - island.z) * scale + centerY,
        rx = island.radiusX * scale,
        rz = island.radiusZ * scale;
      if (x + rx < 0 || x - rx > width || y + rz < 0 || y - rz > height) continue;
      c.save();
      c.translate(x, y);
      c.rotate(island.heading);
      c.fillStyle = '#205c60';
      c.beginPath();
      c.ellipse(0, 0, rx * 1.4, rz * 1.4, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#a58e57';
      c.beginPath();
      c.ellipse(0, 0, rx, rz, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }
  c.strokeStyle = '#35523b88';
  c.lineWidth = 0.5;
  for (let z = 0; z <= nz; z++) {
    h[z] = [];
    for (let x = 0; x <= nx; x++)
      h[z][x] = terrainHeight(
        originX + ((x / nx) * width - centerX) / scale,
        originZ + (centerY - (z / nz) * height) / scale,
      );
  }
  // Generalise the tiny chart: keep broad relief, not every subpixel terrain ripple.
  // This affects the map only; flight terrain and collisions retain full detail.
  const relief = h.map((row, z) =>
    row.map((v, x) => {
      let sum = v * 4,
        weight = 4;
      for (const [dx, dz] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ])
        if (h[z + dz]?.[x + dx] !== undefined) {
          sum += h[z + dz][x + dx];
          weight++;
        }
      return sum / weight;
    }),
  );
  for (let z = 0; z <= nz; z++) h[z] = relief[z];
  for (let level = 100; level < 3000; level += 100) {
    c.beginPath();
    for (let z = 0; z < nz; z++)
      for (let x = 0; x < nx; x++) {
        const corners = [
            [x, z, h[z][x]],
            [x + 1, z, h[z][x + 1]],
            [x + 1, z + 1, h[z + 1][x + 1]],
            [x, z + 1, h[z + 1][x]],
          ],
          pts = [];
        for (let i = 0; i < 4; i++) {
          const a = corners[i],
            b = corners[(i + 1) % 4];
          if (a[2] < level !== b[2] < level) {
            const t = (level - a[2]) / (b[2] - a[2]);
            pts.push([
              ((a[0] + (b[0] - a[0]) * t) * width) / nx,
              ((a[1] + (b[1] - a[1]) * t) * height) / nz,
            ]);
          }
        }
        for (let i = 0; i + 1 < pts.length; i += 2) {
          c.moveTo(...pts[i]);
          c.lineTo(...pts[i + 1]);
        }
      }
    c.stroke();
  }
  contourCache.set(key, canvas);
  if (contourCache.size > 6) contourCache.delete(contourCache.keys().next().value);
  return result(canvas);
}
function glyph(c, p, heading, color, air = true) {
  c.save();
  c.translate(p.x, p.y);
  c.rotate(heading);
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = 1;
  c.beginPath();
  if (air) {
    c.moveTo(0, -7);
    c.lineTo(4.5, 5);
    c.lineTo(0, 2);
    c.lineTo(-4.5, 5);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(0, -14);
    c.stroke();
  } else {
    c.strokeRect(-3, -3, 6, 6);
    c.beginPath();
    c.moveTo(0, -3);
    c.lineTo(0, -12);
    c.lineTo(-3, -8);
    c.moveTo(0, -12);
    c.lineTo(3, -8);
    c.stroke();
  }
  c.restore();
}
export function renderTacticalMap(canvas, s, targets, aim, options = {}) {
  const width = canvas.width || 240,
    height = canvas.height || 240,
    map = tacticalMapState(s, targets, { width, height, ...options }),
    c = drawingContext(canvas),
    cx = map.centerX,
    cy = map.centerY;
  c.clearRect(0, 0, width, height);
  if (map.jammed) {
    renderRadarNoise(c, s.elapsed, { width, height });
    return map;
  }
  c.fillStyle = '#0a1712';
  c.fillRect(0, 0, width, height);
  const relief = contours(map);
  c.drawImage(relief.canvas, relief.x, relief.y);
  renderMapRoutes(c, map);
  c.save();
  c.beginPath();
  c.rect(7, 7, width - 14, height - 14);
  c.clip();
  c.strokeStyle = '#497144';
  c.lineWidth = 0.7;
  for (const radius of [1 / 3, 2 / 3, 1].map((f) => f * (Math.min(width, height) / 2 - 12))) {
    c.beginPath();
    c.arc(cx, cy, radius, 0, Math.PI * 2);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(cx, 0);
  c.lineTo(cx, height);
  c.moveTo(0, cy);
  c.lineTo(width, cy);
  c.stroke();
  const approach = 13000 * map.scale,
    base = mapPoint(s.recoveryExit || s.airfield?.position || { x: 0, z: 0 }, map);
  c.fillStyle = '#a9c88d';
  c.font = '12px Consolas,monospace';
  c.fillText(tr('N'), cx + 4, 13);
  if (s.recoveryExit) {
    c.strokeStyle = '#a497ff';
    c.fillStyle = '#c1b7ff';
    c.beginPath();
    c.arc(base.x, base.y, Math.max(5, 2500 * map.scale), 0, Math.PI * 2);
    c.stroke();
    c.fillText(tr('KIVONULÁS'), base.x + 7, base.y + 12);
  } else if (!s.noAirfield) {
    c.strokeStyle = '#9fc37388';
    c.setLineDash([3, 4]);
    c.beginPath();
    c.moveTo(base.x, base.y - approach);
    c.lineTo(base.x, base.y + approach);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = '#d1efa8';
    const baseLength = terrainWorld.ocean ? 160 : runway.halfLength;
    c.strokeRect(base.x - 1.5, base.y - baseLength * map.scale, 3, baseLength * 2 * map.scale);
    c.fillText(tr(terrainWorld.ocean ? 'ANYAHAJÓ' : 'BASE'), base.x + 6, base.y + 12);
    c.fillText(tr(terrainWorld.ocean ? '352°' : '000°'), base.x + 5, base.y - approach + 9);
    c.fillText(tr(terrainWorld.ocean ? '' : '180°'), base.x + 5, base.y + approach - 3);
  }
  if (s.spec.transport) {
    const t = targets.find((t) => t.playerControlled && !t.exited);
    if (t) {
      const exit = transportExitPosition(t),
        p = mapPoint(exit, map);
      c.strokeStyle = '#8ccbe3';
      c.strokeRect(p.x - 5, p.y - 5, 10, 10);
      c.fillStyle = '#8ccbe3';
      c.font = '12px Consolas,monospace';
      c.fillText(tr(`KIJÁRAT ${(s.position.distance(exit) / 1000).toFixed(1)} KM`), p.x + 7, p.y);
    }
  }
  const own = mapPoint(s.position, map),
    heading = attitude(s.orientation).heading,
    range = Math.min(100, s.spec.radarRange * map.scale),
    cone = s.spec.radarCone * DEG;
  c.save();
  c.translate(own.x, own.y);
  c.rotate(heading);
  c.strokeStyle = '#b0e18444';
  c.beginPath();
  c.moveTo(0, 0);
  c.arc(0, 0, range, -Math.PI / 2 - cone, -Math.PI / 2 + cone);
  c.closePath();
  c.stroke();
  c.restore();
  if (map.landingRoute) {
    const route = map.landingRoute;
    c.save();
    c.strokeStyle = route.color;
    c.lineWidth = 1.6;
    c.setLineDash([4, 2]);
    c.beginPath();
    route.points.forEach((p, i) => {
      const v = mapPoint(p, map);
      i ? c.lineTo(v.x, v.y) : c.moveTo(v.x, v.y);
    });
    c.stroke();
    c.setLineDash([]);
    const interval = Math.max(1, Math.floor(route.points.length / 10));
    c.beginPath();
    for (let i = interval; i < route.points.length; i += interval) {
      const a = mapPoint(route.points[i - 1], map),
        b = mapPoint(route.points[i], map),
        angle = Math.atan2(b.y - a.y, b.x - a.x);
      for (const sign of [-1, 1]) {
        c.moveTo(b.x, b.y);
        c.lineTo(b.x - 4 * Math.cos(angle + sign * 0.6), b.y - 4 * Math.sin(angle + sign * 0.6));
      }
    }
    c.stroke();
    c.fillStyle = route.color;
    c.font = '12px Consolas,monospace';
    c.fillText(tr(route.tankerId ? 'I · TANKOLÁSI SEGÉDÍV' : 'I · SEGÉDÍV'), 9, height - 22);
    c.restore();
  }
  if (s.canyonTraining) {
    const course = s.canyonTraining;
    c.strokeStyle = '#7edee7';
    c.lineWidth = 1.5;
    c.beginPath();
    course.gates.forEach((g, i) => {
      const p = mapPoint(g.position, map);
      i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y);
    });
    c.stroke();
    course.gates.forEach((g, i) => {
      const p = mapPoint(g.position, map);
      c.fillStyle = i < course.index ? '#739563' : i === course.index ? '#7edee7' : '#44646b';
      c.fillRect(p.x - 2, p.y - 2, 4, 4);
    });
  }
  let cityDrawn = false;
  for (const contact of map.contacts) {
    const point = mapPoint(contact.target.position, map);
    if (contact.target.city) {
      if (cityDrawn) continue;
      cityDrawn = true;
      c.strokeStyle = '#82c6e5';
      c.strokeRect(point.x - 4, point.y - 4, 8, 8);
      c.fillStyle = '#82c6e5';
      c.font = '10px Consolas,monospace';
      c.fillText(tr('VÁROS'), point.x + 6, point.y);
      continue;
    }
    glyph(
      c,
      point,
      contact.motionHeading,
      contact.target.team === 'ally' ? '#82c6e5' : contact.target.civilian ? '#9cdce4' : '#f2b482',
      contact.target.kind === 'air',
    );
    if (contact.target.id === aim.id) {
      c.strokeStyle = contact.target.civilian ? '#bce9ee' : '#f6d5a3';
      c.strokeRect(point.x - 9, point.y - 9, 18, 18);
    }
  }
  glyph(c, own, map.playerHeading, '#c3f18e');
  c.restore();
  return map;
}

export function renderRadarNoise(c, time = 0, { width = 240, height = 240 } = {}) {
  c.fillStyle = '#080808';
  c.fillRect(0, 0, width, height);
  let seed = (Math.floor(time * 20) + 1) * 7919;
  for (let y = 0; y < height; y += 4)
    for (let x = 0; x < width; x += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const gray = seed >>> 24;
      c.fillStyle = `rgb(${gray},${gray},${gray})`;
      c.fillRect(x, y, 4, 4);
    }
  c.fillStyle = '#000b';
  c.fillRect(15, height / 2 - 17, width - 30, 33);
  c.fillStyle = '#fff';
  c.font = 'bold 10px Consolas,monospace';
  c.textAlign = 'center';
  c.fillText(tr('JELZAVARÁS · NAV / RADAR'), width / 2, height / 2 + 3);
  c.textAlign = 'left';
}

function renderMapRoutes(c, map) {
  for (const kind of ['river', 'road']) {
    const path = terrainWorld[kind];
    if (!path) continue;
    const draw = () => {
      c.beginPath();
      let started = false;
      for (let t = -90000; t <= 90000; t += 300) {
        const p = pathPoint(path, t),
          wet =
            kind === 'road' &&
            terrainWorld.river &&
            !terrainWorld.bridge &&
            Math.abs(pathCoordinates(terrainWorld.river, p.x, p.z).across) <
              terrainWorld.river.width * 0.5 + 15;
        if (
          (kind === 'road' &&
            (path.min !== undefined
              ? t < path.min || t > path.max
              : Math.hypot(p.x, p.z) < 4500)) ||
          wet
        ) {
          started = false;
          continue;
        }
        const v = mapPoint(p, map);
        if (started) c.lineTo(v.x, v.y);
        else c.moveTo(v.x, v.y);
        started = true;
      }
      c.stroke();
    };
    c.strokeStyle = kind === 'river' ? '#579ba8' : '#17201c';
    c.lineWidth = kind === 'river' ? Math.max(1, path.width * map.scale) : 3;
    draw();
    if (kind === 'road') {
      c.strokeStyle = '#d0bd88';
      c.lineWidth = 1;
      draw();
    }
  }
  c.fillStyle = '#d0bd88';
  c.font = '12px Consolas,monospace';
  if (terrainWorld.road) c.fillText(tr('━ ÚT'), 9, (map.height || 240) - 9);
  if (terrainWorld.river) {
    c.fillStyle = '#72b3be';
    c.fillText(tr('~ FOLYÓ'), 76, (map.height || 240) - 9);
  }
}
