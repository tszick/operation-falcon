import { renderCarrier } from './carrierVisuals.js';
import { renderCityVisuals } from './cityVisuals.js';
import { renderEnvironmentSky } from './environmentSky.js';
import { homeRunwayMesh, runwaySurfaceMesh } from './runwayVisuals.js';
import { surfaceStyle } from './surfaceStyle.js';
import { transportExitPosition } from './transportRole.js';
import { damagedVertex, modelFacePresent } from './modelDamage.js';
import { damageVibration } from './damage.js';
import { tailGunPose, tailGunStatus } from './tailGunnery.js';
import { segmentInView, projectedInView } from './viewCulling.js';
import { GpuModels } from './gpuModels.js';
import { aircraftFlightSpec } from './aiAircraftSpec.js';
import { isHostile } from './unitTypes.js';
import { formatCallSign } from './airSuperiority.js';
import { renderCanyonCourse } from './canyonTraining.js';
import { silhouetteIndices } from './modelDetail.js';
import { visibleMeshEdges } from './hiddenLines.js';
import { cockpitHudFooterY } from './cockpitGeometry.js';
import { renderTerrainSurface } from './terrainSurface.js';
import { getLandingRoute, renderLandingRoute } from './landingRoute.js';
import { enemyAircraft } from './enemies.js';
import {
  projectFeaturePolygon,
  terrainFeatureVisible,
  renderTerrainFeatures,
} from './terrainFeatures.js';
import { renderGroundTarget, groundMesh } from './groundModels.js';
import { navigationJammed, targetMasked } from './electronicWarfare.js';
import { Vec3, Quat, forward, up, right, attitude, DEG, clamp } from './math.js';
import { terrainHeight, terrainWorld, homeHangars } from './terrain.js';
import { radarContacts, bombImpact } from './targeting.js';
import { aircraftMesh } from './airframes.js';
import { createStars, projectStar, starOccluded } from './sky.js';
import { renderWeapons } from './weaponRenderer.js';
import { renderDamageSmoke } from './damageVisuals.js';
import { damageResponse } from './damage.js';
import { renderCountermeasures } from './countermeasureVisuals.js';
export { aircraftMesh } from './airframes.js';
// Carrier navigation marks the physical deck, not the old land-runway approach point.
export function baseMarkerPosition(targets, ocean = false) {
  const home = targets.find((t) => t.home);
  if (home?.remoteHome) return home.position.clone().add(new Vec3(0, 10, -1000));
  return ocean
    ? (home?.position.clone() || new Vec3()).add(new Vec3(0, 20, 0))
    : new Vec3(0, 10, -1000);
}
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gpuModels = GpuModels.create();
    this.camera = new Vec3();
    this.q = new Quat();
    this.thirdPerson = false;
    this.surfaceMode = 'vector';
    this.surfaceLines = true;
    this.stars = createStars();
    this.resize();
  }
  resize() {
    const d = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = this.w * d;
    this.canvas.height = this.h * d;
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
    this.focal = this.h * 0.8;
  }
  setup(position, q) {
    this.visibilityColumns = new Map();
    this.visibilityRevision = terrainWorld.revision;
    this.camera = position;
    this.q = q;
    this.f = forward(q);
    this.u = up(q);
    this.r = right(q);
  }
  local(p) {
    const d = p.clone().sub(this.camera);
    return new Vec3(d.dot(this.r), d.dot(this.u), d.dot(this.f));
  }
  project(p) {
    const v = this.local(p);
    if (v.z < 1) return null;
    return {
      x: this.w * 0.5 + (v.x * this.focal) / v.z,
      y: this.h * 0.53 - (v.y * this.focal) / v.z,
      depth: v.z,
    };
  }
  line(a, b) {
    if (!this.worldOcclusion) {
      this.rawLine(a, b);
      return;
    }
    if (this.f && !segmentInView(this, a, b)) return;
    // Split long edges at ridge crossings instead of leaking the hidden portion.
    const count = Math.min(32, Math.max(1, Math.ceil(a.distance(b) / 150))),
      delta = b.clone().sub(a);
    let start = a,
      visible = this.worldVisible(a);
    for (let i = 1; i <= count; i++) {
      const end = a.clone().add(delta.clone().scale(i / count)),
        next = this.worldVisible(end);
      if (visible && next) this.rawLine(start, end);
      else if (visible !== next) {
        let lo = start,
          hi = end;
        for (let j = 0; j < 7; j++) {
          const mid = lo.clone().add(hi).scale(0.5);
          if (this.worldVisible(mid) === visible) lo = mid;
          else hi = mid;
        }
        if (visible) this.rawLine(start, lo);
        else this.rawLine(hi, end);
      }
      start = end;
      visible = next;
    }
  }
  rawLine(a, b) {
    let v = this.local(a),
      w = this.local(b);
    if (v.z < 1 && w.z < 1) return;
    if (v.z < 1)
      v = v.add(
        w
          .clone()
          .sub(v)
          .scale((1 - v.z) / (w.z - v.z)),
      );
    if (w.z < 1)
      w = w.add(
        v
          .clone()
          .sub(w)
          .scale((1 - w.z) / (v.z - w.z)),
      );
    const ax = this.w * 0.5 + (v.x * this.focal) / v.z,
      ay = this.h * 0.53 - (v.y * this.focal) / v.z,
      bx = this.w * 0.5 + (w.x * this.focal) / w.z,
      by = this.h * 0.53 - (w.y * this.focal) / w.z;
    if (
      (ax < 0 && bx < 0) ||
      (ax > this.w && bx > this.w) ||
      (ay < 0 && by < 0) ||
      (ay > this.h && by > this.h)
    )
      return;
    this.ctx.moveTo(ax, ay);
    this.ctx.lineTo(bx, by);
  }
  mesh(mesh, position, q, scale = 1, color = '#b9ed8c', condition = null, material = 'concrete') {
    const entry = { mesh, position, q, scale, color, condition, material };
    if (this.meshQueue) this.meshQueue.push(entry);
    else this.paintMeshes([entry]);
  }
  flushMeshes() {
    const queue = this.meshQueue;
    this.meshQueue = null;
    if (queue?.length) this.paintMeshes(queue);
  }
  paintMeshes(entries) {
    if (this.gpuModels?.render(this, entries)) return;
    const c = this.ctx,
      screen = [],
      faces = [],
      details = [],
      fills = [];
    // All opaque models share one face/edge pass: a far object cannot repaint a
    // near object's outline merely because it was submitted later in the frame.
    for (const { mesh, position, q, scale, color, condition, material } of entries) {
      const center = this.local(position),
        radius = (mesh.radius || Math.max(...mesh.points.map((p) => p.length()))) * scale;
      if (
        center.z + radius < 1 ||
        Math.abs(center.x) >
          (center.z * this.w) / (2 * this.focal) +
            radius * Math.hypot(1, this.w / (2 * this.focal)) ||
        Math.abs(center.y) >
          (center.z * this.h * 0.53) / this.focal +
            radius * Math.hypot(1, (this.h * 0.53) / this.focal)
      )
        continue;
      const pts = mesh.points.map((v, i) =>
        q.rotate(damagedVertex(mesh, i, condition).clone().scale(scale)).add(position),
      );
      let modelFaces = (mesh.faces || []).filter((face) => modelFacePresent(mesh, face, condition)),
        modelDetails = (mesh.faces ? mesh.details || [] : mesh.edges || []).filter((edge) =>
          modelFacePresent(mesh, edge, condition),
        );
      if (center.z - radius > 1 && (radius * this.focal) / center.z < 6) {
        const present = [...new Set(modelFaces.flat())],
          projected = present.map((i) => this.project(pts[i])),
          hull = silhouetteIndices(projected).map((i) => present[i]);
        modelFaces = hull.length >= 3 ? [hull] : [];
        modelDetails = [];
      }
      const used = new Set([...modelFaces.flat(), ...modelDetails.flat()]),
        visible = new Map();
      for (const i of used) visible.set(i, !this.worldOcclusion || this.worldVisible(pts[i]));
      const projectionCache = new Map();
      for (const original of modelFaces) {
        if (original.some((i) => !visible.get(i))) continue;
        // Clip to the near plane; never drop a whole wall when one corner passes
        // behind the pilot. This matters for hangars and other large nearby units.
        const polygon = projectFeaturePolygon(
          this,
          original.map((i) => pts[i]),
          projectionCache,
        );
        if (
          polygon.length < 3 ||
          polygon.every((p) => p.x < 0) ||
          polygon.every((p) => p.x > this.w) ||
          polygon.every((p) => p.y < 0) ||
          polygon.every((p) => p.y > this.h)
        )
          continue;
        const ids = polygon.map((p) => screen.push({ ...p, color }) - 1);
        faces.push(ids);
        fills.push({
          ids,
          depth: polygon.reduce((sum, p) => sum + p.depth, 0) / polygon.length,
          color:
            mesh.flapFaces?.includes(original) && mesh.flapFraction > 0.02
              ? '#40522b'
              : this.surfaceMode !== 'vector'
                ? material === 'aircraft'
                  ? '#929ba2'
                  : material === 'camo'
                    ? '#686e49'
                    : material === 'hangar'
                      ? '#939b9b'
                      : material === 'asphalt'
                        ? '#303437'
                        : '#8b918c'
                : '#101c16',
        });
      }
      for (const [a, b] of modelDetails) {
        if (!visible.get(a) || !visible.get(b)) continue;
        let v = this.local(pts[a]),
          w = this.local(pts[b]);
        if (v.z < 1 && w.z < 1) continue;
        if (v.z < 1)
          v = v.clone().add(
            w
              .clone()
              .sub(v)
              .scale((1 - v.z) / (w.z - v.z)),
          );
        if (w.z < 1)
          w = w.clone().add(
            v
              .clone()
              .sub(w)
              .scale((1 - w.z) / (v.z - w.z)),
          );
        const pair = [v, w].map(
          (p) =>
            screen.push({
              x: this.w * 0.5 + (p.x * this.focal) / p.z,
              y: this.h * 0.53 - (p.y * this.focal) / p.z,
              depth: p.z,
              color,
            }) - 1,
        );
        details.push(pair);
      }
    }
    if (this.debugMetrics)
      this.modelMetrics = {
        entries: entries.length,
        faces: faces.length,
        details: details.length,
        vertices: screen.length,
        largest: entries
          .map((e) => ({
            faces: e.mesh.faces?.length || 0,
            points: e.mesh.points.length,
            distance: Math.round(e.position.distance(this.camera)),
            pixels: Math.round(
              ((e.mesh.radius || 0) * this.focal) / Math.max(1, this.local(e.position).z),
            ),
          }))
          .sort((a, b) => b.faces - a.faces)
          .slice(0, 4),
      };
    fills.sort((a, b) => b.depth - a.depth);
    for (const face of fills) {
      c.beginPath();
      face.ids.forEach((i, j) =>
        j ? c.lineTo(screen[i].x, screen[i].y) : c.moveTo(screen[i].x, screen[i].y),
      );
      c.closePath();
      c.fillStyle = face.color;
      c.fill();
    }
    const strokes = new Map();
    for (const [a, b] of visibleMeshEdges(screen, faces, details, {
      minLength: 0.65,
      faceEdges: this.surfaceLines !== false,
    })) {
      const color = a.color || '#b9ed8c';
      if (!strokes.has(color)) strokes.set(color, []);
      strokes.get(color).push([a, b]);
    }
    c.lineWidth = 0.8;
    for (const [color, segments] of strokes) {
      c.strokeStyle = color;
      c.beginPath();
      for (const [a, b] of segments) {
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
      }
      c.stroke();
    }
  }

  skyStars() {
    const c = this.ctx,
      starLevel = surfaceStyle(this.surfaceMode).stars;
    if (!starLevel) return;
    for (const star of this.stars) {
      const p = projectStar(star, this, this.w, this.h, this.focal);
      if (!p || starOccluded(star.direction, this.camera, terrainHeight)) continue;
      const opacity = starLevel * star.brightness * Math.min(1, 0.35 + star.direction.y * 3);
      c.fillStyle = `rgba(205,225,220,${opacity})`;
      c.fillRect(p.x, p.y, star.size, star.size);
      if (star.size > 1.4) {
        c.fillStyle = `rgba(190,221,216,${opacity * 0.3})`;
        c.fillRect(p.x - 2, p.y + 0.5, 5, 1);
        c.fillRect(p.x + 0.5, p.y - 2, 1, 5);
      }
    }
  }
  groundHorizon() {
    const c = this.ctx,
      w = this.w,
      h = this.h,
      cx = w * 0.5,
      cy = h * 0.53;
    const worldY = (p) =>
      this.f.y + (this.r.y * (p.x - cx)) / this.focal + (this.u.y * (cy - p.y)) / this.focal;
    const corners = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ],
      polygon = [],
      cuts = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i],
        b = corners[(i + 1) % 4],
        va = worldY(a),
        vb = worldY(b);
      if (va <= 0) polygon.push(a);
      if (va <= 0 !== vb <= 0) {
        const t = va / (va - vb),
          p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        polygon.push(p);
        cuts.push(p);
      }
    }
    if (polygon.length) {
      c.fillStyle =
        this.surfaceMode === 'vector' ? '#0e1e16' : surfaceStyle(this.surfaceMode).sky[2];
      c.beginPath();
      polygon.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      c.fill();
    }
    if (cuts.length === 2 && this.surfaceMode !== 'ocean') {
      c.strokeStyle = '#6f866055';
      c.beginPath();
      c.moveTo(cuts[0].x, cuts[0].y);
      c.lineTo(cuts[1].x, cuts[1].y);
      c.stroke();
    }
  }
  terrain() {
    renderTerrainSurface(this);
  }
  worldVisible(p) {
    if (!this.visibilityColumns || this.visibilityRevision !== terrainWorld.revision) {
      this.visibilityColumns = new Map();
      this.visibilityRevision = terrainWorld.revision;
    }
    const key = p.x + ':' + p.z;
    let column = this.visibilityColumns.get(key);
    if (column) {
      if (p.y >= column.visible) return true;
      if (p.y <= column.hidden) return false;
    } else {
      column = { visible: Infinity, hidden: -Infinity };
      this.visibilityColumns.set(key, column);
    }
    const visible = terrainFeatureVisible(this.camera, p);
    if (visible) column.visible = Math.min(column.visible, p.y);
    else column.hidden = Math.max(column.hidden, p.y);
    return visible;
  }
  projectWorld(p, padding = 150) {
    const screen = this.project(p);
    if (!projectedInView(this, screen, padding)) return null;
    return this.worldVisible(p) ? screen : null;
  }
  runway(jammed = false) {
    if (terrainWorld.ocean) {
      renderCarrier(this);
      return;
    }
    if (this.surfaceMode !== 'vector')
      this.mesh(runwaySurfaceMesh(), new Vec3(), new Quat(), 1, '#c8e4aa', null, 'asphalt');
    if (this.gpuModels?.gl && !this.gpuModels.lost && !this.gpuModels.gl.isContextLost()) {
      this.mesh(homeRunwayMesh(!jammed), new Vec3(), new Quat(), 1, '#c8e4aa', null, 'runway');
      for (const h of homeHangars)
        this.box(new Vec3(h.x, 0, h.z), h.halfWidth, h.height, h.halfLength, '#64735f');
      return;
    }
    const c = this.ctx;
    c.strokeStyle = '#c8e4aa';
    c.lineWidth = 1.5;
    c.beginPath();
    this.line(new Vec3(-45, 0.8, -1600), new Vec3(-45, 0.8, 1600));
    this.line(new Vec3(45, 0.8, -1600), new Vec3(45, 0.8, 1600));
    this.line(new Vec3(-45, 0.8, -1600), new Vec3(45, 0.8, -1600));
    this.line(new Vec3(-45, 0.8, 1600), new Vec3(45, 0.8, 1600));
    for (let z = -1500; z < 1600; z += 130) this.line(new Vec3(0, 1, z), new Vec3(0, 1, z + 55));
    for (let z = -1500; z < 1600; z += 140) {
      for (const x of [-48, 48]) {
        this.line(new Vec3(x, 2, z), new Vec3(x, 5, z));
      }
    }
    for (const z of [-1450, 1450])
      for (let x = -35; x <= 35; x += 14) this.line(new Vec3(x, 1, z), new Vec3(x, 1, z + 60));
    c.stroke();
    for (const h of homeHangars)
      this.box(new Vec3(h.x, 0, h.z), h.halfWidth, h.height, h.halfLength, '#64735f');
    // Two approach gates on the three-degree glide path.
    if (jammed) return;
    c.strokeStyle = '#89af6955';
    c.beginPath();
    for (const z of [-2600, -3600]) {
      const y = (-z - 1600) * Math.tan(3 * DEG) + 3;
      this.line(new Vec3(-60, y - 12, z), new Vec3(-60, y + 12, z));
      this.line(new Vec3(-60, y + 12, z), new Vec3(60, y + 12, z));
      this.line(new Vec3(60, y + 12, z), new Vec3(60, y - 12, z));
    }
    c.stroke();
  }
  box(p, w, h, d, color) {
    this.boxMeshes ??= new Map();
    const key = [w, h, d].join(':');
    if (this.boxMeshes.has(key)) {
      this.mesh(this.boxMeshes.get(key), p, new Quat(), 1, color, null, 'hangar');
      return;
    }
    const points = [
      [-w, 0, -d],
      [w, 0, -d],
      [w, 0, d],
      [-w, 0, d],
      [-w, h, -d],
      [w, h, -d],
      [w, h, d],
      [-w, h, d],
    ].map((v) => new Vec3(...v));
    const mesh = {
      points,
      faces: [
        [0, 1, 5, 4],
        [1, 2, 6, 5],
        [2, 3, 7, 6],
        [3, 0, 4, 7],
        [4, 5, 6, 7],
        [3, 2, 1, 0],
      ],
      details: [],
    };
    this.boxMeshes.set(key, mesh);
    this.mesh(mesh, p, new Quat(), 1, color, null, 'hangar');
  }

  marker(p, label, color = '#baf37d', locked = false, { offscreenLabel = false } = {}) {
    const c = this.ctx,
      screen = this.project(p);
    if (projectedInView(this, screen, 0)) {
      const { x, y } = screen;
      c.fillStyle = color;
      for (const [ink, width] of [
        ['#071014', 4.5],
        [color, 1.7],
      ]) {
        c.strokeStyle = ink;
        c.lineWidth = width;
        c.strokeRect(x - 12, y - 12, 24, 24);
        if (locked) {
          c.beginPath();
          c.arc(x, y, 21, 0, Math.PI * 2);
          c.stroke();
        }
      }
      c.font = 'bold 12px Consolas,monospace';
      c.textAlign = 'center';
      this.markerLabel(label, x, y - 22);
      return screen;
    }
    const local = this.local(p),
      angle = Math.atan2(local.x, local.z),
      x = this.w * 0.5 + Math.sin(angle) * Math.min(this.w * 0.32, 320),
      y = this.h * 0.53 - Math.cos(angle) * Math.min(this.h * 0.26, 190);
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.strokeStyle = color;
    c.beginPath();
    c.moveTo(-6, 7);
    c.lineTo(0, -7);
    c.lineTo(6, 7);
    c.stroke();
    c.restore();
    c.fillStyle = color;
    c.font = 'bold 12px Consolas,monospace';
    c.textAlign = 'center';
    if (offscreenLabel) this.markerLabel(label, x, y + 25);
    return null;
  }
  markerLabel(label, x, y) {
    if (!label) return;
    const c = this.ctx,
      width = (c.measureText?.(label).width || label.length * 6) + 10,
      half = width / 2,
      px = clamp(x, half + 8, this.w - half - 8),
      top = 45,
      bottom = cockpitHudFooterY(this.w, this.h) - 12,
      used = this.markerLabels || (this.markerLabels = []);
    let py = clamp(y, top, bottom);
    for (let step = 0; step < 40; step++) {
      const candidate = clamp(y - step * 16, top, bottom),
        rect = { left: px - half, right: px + half, top: candidate - 12, bottom: candidate + 4 };
      if (
        used.every(
          (r) =>
            rect.right < r.left ||
            rect.left > r.right ||
            rect.bottom < r.top ||
            rect.top > r.bottom,
        )
      ) {
        py = candidate;
        used.push(rect);
        break;
      }
    }
    c.strokeStyle = '#071014';
    c.lineWidth = 3.5;
    c.lineJoin = 'round';
    c.strokeText?.(label, px, py);
    c.fillText(label, px, py);
  }
  flakBattery(p) {
    for (const x of [-30, 30]) {
      const base = p.clone().add(new Vec3(x, -6, 0));
      this.box(base, 9, 5, 13, '#d0a780');
      const c = this.ctx;
      c.strokeStyle = '#e5b98c';
      c.lineWidth = 1.7;
      c.beginPath();
      for (const offset of [-2, 2])
        this.line(
          base.clone().add(new Vec3(offset, 7, 0)),
          base.clone().add(new Vec3(offset, 23, 13)),
        );
      c.stroke();
    }
  }
  samBattery(p) {
    const color = '#d1a582';
    for (const x of [-42, 42]) {
      const base = p.clone().add(new Vec3(x, -6, 0));
      this.box(base, 11, 7, 20, color);
      const c = this.ctx;
      c.strokeStyle = color;
      c.lineWidth = 1.4;
      c.beginPath();
      for (const offset of [-6, -2, 2, 6]) {
        const start = base.clone().add(new Vec3(offset, 7, -9)),
          end = start.clone().add(new Vec3(0, 18, 19));
        this.line(start, end);
        this.line(end, end.clone().add(new Vec3(-2, -4, -1)));
        this.line(end, end.clone().add(new Vec3(2, -4, -1)));
      }
      c.stroke();
    }
    const radar = p.clone().add(new Vec3(0, -6, 35));
    this.box(radar, 8, 6, 12, color);
    const c = this.ctx;
    c.strokeStyle = color;
    c.beginPath();
    this.line(radar.clone().add(new Vec3(0, 6, 0)), radar.clone().add(new Vec3(0, 24, 0)));
    for (let x = -12; x < 12; x += 3) {
      this.line(
        radar.clone().add(new Vec3(x, 24, 0)),
        radar.clone().add(new Vec3(x + 3, 24 + Math.sin(((x + 12) / 24) * Math.PI) * 6, -3)),
      );
    }
    c.stroke();
  }
  render(s, targets, weapons, aim) {
    const c = this.ctx,
      { w, h } = this,
      wreck = s.dying || s.crashed,
      rear = !!s.rearView && !wreck;
    let camera,
      cameraQ = s.orientation;
    if (wreck) {
      if (!this.wreckOffset) {
        const direction = s.velocity.length() > 5 ? s.velocity.clone() : forward(s.orientation);
        direction.y = 0;
        direction.normalize();
        this.wreckOffset = direction.scale(-125).add(new Vec3(58, 48, 0));
      }
      camera = s.position.clone().add(this.wreckOffset);
      camera.y = Math.max(camera.y, terrainHeight(camera.x, camera.z) + 8);
      const look = s.position
        .clone()
        .add(new Vec3(0, 4, 0))
        .sub(camera);
      cameraQ = Quat.euler(
        Math.atan2(look.x, look.z),
        Math.atan2(look.y, Math.hypot(look.x, look.z)),
        0,
      );
    } else if (rear) {
      this.wreckOffset = null;
      const pose = tailGunPose(s);
      camera = pose.origin.clone().add(up(s.orientation).scale(0.4));
      cameraQ = pose.orientation;
    } else {
      this.wreckOffset = null;
      camera = s.position
        .clone()
        .add(up(s.orientation).scale(this.thirdPerson ? 18 : 1.5))
        .add(forward(s.orientation).scale(this.thirdPerson ? -58 : 4));
      if (
        !this.thirdPerson &&
        !(
          typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
        )
      ) {
        const shake = damageResponse(s).shake;
        camera
          .add(right(s.orientation).scale(Math.sin(s.elapsed * 39) * shake * 0.18))
          .add(up(s.orientation).scale(Math.sin(s.elapsed * 31) * shake * 0.12));
      }
    }
    if (!wreck && !rear && !this.thirdPerson && this.headLook)
      cameraQ = this.headLook.orientation(s.orientation);
    if (
      !wreck &&
      !this.thirdPerson &&
      !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
    ) {
      const vibration = damageVibration(s);
      cameraQ = cameraQ.multiply(Quat.euler(vibration.yaw, vibration.pitch, vibration.roll));
    }
    this.setup(camera, cameraQ);
    renderEnvironmentSky(this);
    this.worldOcclusion = false;
    this.skyStars();
    if (!this.gpuModels?.renderHorizon(this, true)) this.groundHorizon();
    this.terrain();
    const featureStart = this.debugMetrics ? performance.now() : 0;
    renderTerrainFeatures(this);
    if (this.debugMetrics) this.featureMs = performance.now() - featureStart;
    const jammed = navigationJammed(s, targets);
    this.worldOcclusion = true;
    this.meshQueue = [];
    this.runway(jammed);
    this.worldOcclusion = false;
    renderLandingRoute(this, getLandingRoute(s, { jammed }));
    this.worldOcclusion = true;
    renderCanyonCourse(this, s);
    const contacts = radarContacts(s, targets);
    if (s.spec.transport && !jammed) {
      const transport = targets.find((t) => t.playerControlled);
      if (transport && !transport.exited) {
        const exit = transportExitPosition(transport);
        this.marker(exit, `KIJÁRAT ${(s.position.distance(exit) / 1000).toFixed(1)} KM`, '#8ccbe3');
      }
    }
    renderCityVisuals(this, targets);
    for (const t of targets
      .filter(
        (t) =>
          !t.city &&
          !t.exited &&
          !t.playerControlled &&
          (!t.home || t.remoteHome) &&
          !t.renderedAsOriginBase &&
          (t.alive || t.falling),
      )
      .sort((a, b) => this.local(b.position).z - this.local(a.position).z)) {
      if (t.type === 'ballistic') {
        this.mesh(
          groundMesh('ballistic'),
          t.position,
          Quat.euler(t.heading, t.pitch || 0, 0),
          1,
          '#ffc48b',
        );
      } else if (t.kind === 'air') {
        if (t.flight) renderDamageSmoke(this, t.flight);
        this.mesh(
          aircraftMesh(t.aircraftId || 'mig29'),
          t.position,
          t.flight?.orientation || Quat.euler(t.heading, t.pitch || 0, t.bank || 0),
          1,
          t.team === 'ally'
            ? '#8ccbe3'
            : t.civilian
              ? '#a6dce5'
              : t.flight?.damage > 40
                ? '#e0a270'
                : '#c39a78',
          t.flight?.condition,
          'aircraft',
        );
      } else renderGroundTarget(this, t);
    }
    if ((this.thirdPerson || wreck) && !s.crashed)
      this.mesh(
        aircraftMesh(
          s.spec.id,
          s.mach > 0.5 ? Math.min(1, (s.mach - 0.5) / 0.9) : 0,
          s.flapPosition ?? (s.flaps ? 1 : 0),
        ),
        s.position,
        s.orientation,
        1,
        s.damage > 40 ? '#e0a270' : '#c7efa2',
        s.condition,
        'aircraft',
      );
    this.flushMeshes();
    this.markerLabels = [];
    const friendlyFighters = targets.filter((t) => t.team === 'ally' && t.type === 'fighter');
    for (const t of targets) {
      if (
        !t.exited &&
        !t.playerControlled &&
        !t.home &&
        !t.city &&
        t.alive &&
        !jammed &&
        !targetMasked(t, targets)
      ) {
        const contact = contacts.find((x) => x.target === t),
          locked = aim.id === t.id && aim.locked;
        let name = t.name;
        if (t.team === 'ally' && t.kind === 'air')
          name =
            t.displayCallSign ||
            (t.radioCallSign
              ? formatCallSign(t.radioCallSign)
              : t.type === 'fighter'
                ? formatCallSign({ flight: 'Falcon', number: friendlyFighters.indexOf(t) + 2 })
                : 'Transport');
        else if (isHostile(t, s) && t.kind === 'air' && t.aircraftId)
          name = aircraftFlightSpec(t.aircraftId).name;
        // Unlocked hostile contacts keep their geometry/marker, without a wall of names.
        const label =
          isHostile(t, s) && !locked
            ? ''
            : `${name.toUpperCase()} ${(t.position.distance(s.position) / 1000).toFixed(1)} KM`;
        this.marker(
          t.position,
          label,
          t.team === 'ally'
            ? '#64d7ff'
            : aim.id === t.id
              ? aim.locked
                ? '#baf37d'
                : '#ffda83'
              : contact?.visible
                ? '#ff9875'
                : '#92a08a',
          locked,
        );
      }
    }
    const city = targets.filter((t) => t.city);
    if (city.length && !jammed) {
      const center = city.reduce((p, t) => p.add(t.position), new Vec3()).scale(1 / city.length);
      this.marker(
        center,
        `VÁROS ${Math.round((city.filter((t) => t.alive).length / city.length) * 100)}%`,
        '#64d7ff',
      );
    }
    if (
      !jammed &&
      (s.recoveryExit ||
        s.airfield ||
        targets.every((t) => !t.alive) ||
        targets.some((t) => t.civilian && t.withdrawing) ||
        s.position.length() > 3500)
    )
      this.marker(
        s.recoveryExit || baseMarkerPosition(targets, terrainWorld.ocean),
        `${s.recoveryExit ? 'KIVONULÁS' : terrainWorld.ocean ? 'ANYAHAJÓ' : 'BASE'} ${(s.position.distance(s.recoveryExit || s.airfield?.position || new Vec3()) / 1000).toFixed(1)} KM`,
        '#baf37d',
        false,
        { offscreenLabel: true },
      );
    const effectsStart = this.debugMetrics ? performance.now() : 0;
    renderWeapons(this, s, weapons);
    if (this.debugMetrics) this.effectsMs = performance.now() - effectsStart;
    const cmStart = this.debugMetrics ? performance.now() : 0;
    renderCountermeasures(this, s);
    for (const t of targets)
      if (t.defense?.countermeasures?.decoys.length) renderCountermeasures(this, t.defense);
    if (this.debugMetrics) this.countermeasureMs = performance.now() - cmStart;
    renderDamageSmoke(this, s);
    this.worldOcclusion = false;
    if (wreck) return;
    if (rear) {
      this.tailHud(s);
      return;
    }
    if (!jammed && weapons.selected === 'bomb' && !s.onGround) {
      const p = this.project(bombImpact(s));
      if (p) {
        c.strokeStyle = '#c3f28b';
        c.beginPath();
        c.arc(p.x, p.y, 14, 0, Math.PI * 2);
        c.moveTo(p.x, p.y - 20);
        c.lineTo(p.x, p.y + 20);
        c.moveTo(p.x - 20, p.y);
        c.lineTo(p.x + 20, p.y);
        c.stroke();
      }
    }
    if (
      !jammed &&
      weapons.selected === 'gun' &&
      weapons.solution?.lead?.reachable &&
      weapons.solution.status !== 'range'
    ) {
      const p = this.project(weapons.solution.lead.point);
      if (p) {
        c.strokeStyle = weapons.solution.status === 'good' ? '#baf37d' : '#e9d994';
        c.beginPath();
        c.arc(p.x, p.y, 6, 0, Math.PI * 2);
        c.stroke();
      }
    }
    const nose =
      !this.thirdPerson && this.headLook?.active
        ? this.project(s.position.clone().add(forward(s.orientation).scale(1500)))
        : { x: w * 0.5, y: h * 0.53 };
    if (
      nose &&
      Math.abs(this.headLook?.yaw || 0) < 75 * DEG &&
      Math.abs(this.headLook?.pitch || 0) < 60 * DEG
    ) {
      this.hudOffset = { x: nose.x - w * 0.5, y: nose.y - h * 0.53 };
      c.save();
      c.translate(this.hudOffset.x, this.hudOffset.y);
      this.hud(s, weapons, aim, jammed);
      c.restore();
      this.hudOffset = null;
    }
    if (s.g > 6) {
      c.fillStyle = `rgba(8,8,8,${clamp((s.g - 6) * 0.09, 0, 0.65)})`;
      c.fillRect(0, 0, w, h);
    }
  }
  tailHud(s) {
    const c = this.ctx,
      { w, h } = this,
      status = tailGunStatus(s),
      cx = w * 0.5,
      cy = h * 0.5;
    c.strokeStyle = status.canFire ? '#baf37d' : '#ffaf75';
    c.fillStyle = c.strokeStyle;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(cx, cy, 14, 0, Math.PI * 2);
    for (const sign of [-1, 1]) {
      c.moveTo(cx + sign * 20, cy);
      c.lineTo(cx + sign * 6, cy);
      c.moveTo(cx, cy + sign * 20);
      c.lineTo(cx, cy + sign * 6);
    }
    c.stroke();
    c.textAlign = 'center';
    c.font = 'bold 15px Consolas,monospace';
    c.fillText(`FAROKGÉPÁGYÚ · ${s.ammo.tailGun || 0} DB`, cx, h - 66);
    c.font = '12px Consolas,monospace';
    c.fillText(
      status.canFire ? 'EGÉR: CÉLZÁS · SZÓKÖZ: TŰZ · V: PILÓTAFÜLKE' : status.label,
      cx,
      h - 42,
    );
    c.fillText(`IAS ${Math.round(s.ias * 3.6)} KM/H · AGL ${Math.round(s.agl)} M`, cx, h - 22);
  }
  hud(s, weapons, aim, jammed = false) {
    const c = this.ctx,
      { w, h } = this,
      a = attitude(s.orientation),
      cx = w * 0.5,
      cy = h * 0.53,
      span = Math.min(210, w * 0.2);
    c.strokeStyle = '#baf37d';
    c.fillStyle = '#baf37d';
    c.font = '12px Consolas,monospace';
    c.lineWidth = 1;
    c.textAlign = 'center';
    c.save();
    c.beginPath();
    c.rect(
      cx - span + 35,
      Math.max(180, cy - 150),
      span * 2 - 70,
      Math.min(300, h - 90 - Math.max(180, cy - 150)),
    );
    c.clip();
    c.translate(cx, cy);
    c.rotate(a.bank);
    for (let deg = -90; deg <= 90; deg += 10) {
      const y = (a.pitch - deg * DEG) * this.focal;
      if (Math.abs(y) > 500) continue;
      c.setLineDash(deg < 0 ? [5, 5] : []);
      c.beginPath();
      const len = deg === 0 ? 120 : 60;
      c.moveTo(-len, y);
      c.lineTo(-15, y);
      c.moveTo(15, y);
      c.lineTo(len, y);
      c.stroke();
      c.setLineDash([]);
      c.fillText(String(deg), -len - 20, y + 4);
      c.fillText(String(deg), len + 20, y + 4);
    }
    c.restore();
    c.beginPath();
    c.moveTo(cx - 35, cy);
    c.lineTo(cx - 10, cy);
    c.lineTo(cx, cy + 7);
    c.lineTo(cx + 10, cy);
    c.lineTo(cx + 35, cy);
    c.moveTo(cx, cy - 12);
    c.lineTo(cx, cy - 5);
    c.stroke();
    const fp = this.project(s.position.clone().add(s.velocity.clone().normalize().scale(1500)));
    if (!jammed && fp && s.speed > 10) {
      fp.x -= this.hudOffset?.x || 0;
      fp.y -= this.hudOffset?.y || 0;
      c.beginPath();
      c.arc(fp.x, fp.y, 8, 0, Math.PI * 2);
      c.moveTo(fp.x - 16, fp.y);
      c.lineTo(fp.x - 8, fp.y);
      c.moveTo(fp.x + 8, fp.y);
      c.lineTo(fp.x + 16, fp.y);
      c.moveTo(fp.x, fp.y - 15);
      c.lineTo(fp.x, fp.y - 8);
      c.stroke();
    }
    const speed = Math.round(s.ias * 3.6),
      alt = Math.round(s.position.y);
    for (let side of [-1, 1]) {
      const x = cx + side * span,
        value = side < 0 ? speed : alt,
        increment = side < 0 ? 50 : 100;
      c.fillText(side < 0 ? 'IAS KM/H' : 'MSL M', x, Math.max(162, cy - 155));
      for (let i = -3; i <= 3; i++) {
        const tick = Math.floor(value / increment) * increment + i * increment,
          y = cy - (tick - value) * (side < 0 ? 1 : 0.5);
        if (tick < 0 || y < 180 || y > h - 100) continue;
        c.beginPath();
        c.moveTo(x - side * 25, y);
        c.lineTo(x - side * 15, y);
        c.stroke();
        c.fillText(String(tick), x + side * 10, y + 4);
      }
      c.fillStyle = '#0a1715e8';
      c.fillRect(x - 38, cy - 14, 76, 28);
      c.strokeRect(x - 38, cy - 14, 76, 28);
      c.fillStyle = '#cefa9f';
      c.font = 'bold 20px Consolas,monospace';
      c.fillText(String(value), x, cy + 7);
      c.font = '12px Consolas,monospace';
    }
    if (!jammed) {
      const heading = (a.heading / DEG + 360) % 360;
      c.fillText(
        `${Math.round(heading).toString().padStart(3, '0')}°`,
        cx,
        Math.max(140, cy - 207),
      );
      c.beginPath();
      c.moveTo(cx, Math.max(150, cy - 195));
      c.lineTo(cx - 5, Math.max(158, cy - 187));
      c.lineTo(cx + 5, Math.max(158, cy - 187));
      c.closePath();
      c.stroke();
      for (let i = -3; i <= 3; i++) {
        const deg = (Math.round(heading / 10) * 10 + i * 10 + 360) % 360,
          x = cx + (((deg - heading + 540) % 360) - 180) * 3;
        c.fillText(String(deg).padStart(3, '0'), x, Math.max(174, cy - 170));
      }
    }
    c.textAlign = 'left';
    c.fillText(
      `M ${s.mach.toFixed(2)}   G ${s.g.toFixed(1)}`,
      cx - span - 30,
      cockpitHudFooterY(w, h),
    );
    c.fillText(`AGL ${Math.round(s.agl)} M`, cx + span - 40, cockpitHudFooterY(w, h));
    c.fillText(
      `V/S ${s.velocity.y >= 0 ? '+' : ''}${s.velocity.y.toFixed(1)} M/S`,
      cx + span - 40,
      cockpitHudFooterY(w, h) + 20,
    );
    c.textAlign = 'center';
    if (!this.thirdPerson) {
      c.strokeStyle = '#4b6546';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(0, h);
      c.lineTo(w * 0.18, h * 0.88);
      c.lineTo(w * 0.32, h * 0.85);
      c.moveTo(w, h);
      c.lineTo(w * 0.82, h * 0.88);
      c.lineTo(w * 0.68, h * 0.85);
      c.stroke();
    }
  }
  idle(time) {
    const c = this.ctx;
    c.fillStyle = '#071211';
    c.fillRect(0, 0, this.w, this.h);
    this.setup(new Vec3(1600, 1600, -2400), Quat.euler(time * 0.015, -0.2, 0));
    c.globalAlpha = 0.17;
    this.terrain();
    c.globalAlpha = 1;
  }
}
export function renderAircraftPreview(
  canvas,
  spec,
  time,
  model = null,
  mode = 'vector',
  { decorations = true } = {},
) {
  const rect = canvas.getBoundingClientRect(),
    d = Math.min(devicePixelRatio || 1, 2),
    w = rect.width,
    h = rect.height;
  if (canvas.width !== Math.round(w * d) || canvas.height !== Math.round(h * d)) {
    canvas.width = w * d;
    canvas.height = h * d;
  }
  const c = canvas.getContext('2d');
  c.setTransform(d, 0, 0, d, 0, 0);
  c.clearRect(0, 0, w, h);
  if (decorations) {
    c.strokeStyle = '#294032';
    c.lineWidth = 0.6;
    for (let x = 0; x < w; x += 32) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      c.stroke();
    }
    for (let y = 0; y < h; y += 32) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    c.strokeStyle = '#57764a';
    c.beginPath();
    c.ellipse(w / 2, h * 0.76, w * 0.32, h * 0.12, 0, 0, Math.PI * 2);
    c.stroke();
  }
  const mesh = model || aircraftMesh(spec.id),
    q = Quat.euler(0.6 + time * 0.14, 0, 0),
    scale = Math.min((w - 44) / (mesh.radius * 2.3), (h - 30) / (mesh.radius * 1.85));
  const pts = mesh.points.map((p) => q.rotate(p)),
    screen = pts.map((p) => ({
      x: w / 2 + p.x * scale,
      y: h * 0.5 - (p.y * 0.62 + p.z * 0.78) * scale,
      depth: -p.y * 0.78 + p.z * 0.62,
    }));
  const faces = mesh.faces
    .map((ids) => ({ ids, depth: ids.reduce((v, i) => v + screen[i].depth, 0) / ids.length }))
    .sort((a, b) => b.depth - a.depth);
  c.lineWidth = 0.8;
  for (const { ids } of faces) {
    const normal = pts[ids[1]]
        .clone()
        .sub(pts[ids[0]])
        .cross(pts[ids[2]].clone().sub(pts[ids[0]]))
        .normalize(),
      light = Math.abs(normal.dot(new Vec3(0.3, 0.85, 0.4)));
    c.fillStyle =
      mode === 'vector'
        ? `rgb(${Math.round(10 + light * 8)},${Math.round(23 + light * 12)},${Math.round(15 + light * 7)})`
        : `rgb(${(model ? [115, 124, 90] : [162, 170, 177]).map((v) => Math.round(v * (0.5 + light * 0.5))).join(',')})`;
    c.strokeStyle = `rgba(185,235,140,${0.5 + light * 0.4})`;
    c.beginPath();
    ids.forEach((i, j) =>
      j ? c.lineTo(screen[i].x, screen[i].y) : c.moveTo(screen[i].x, screen[i].y),
    );
    c.closePath();
    c.fill();
  }
  c.strokeStyle = mode === 'vector' ? '#b9eb8c' : '#647166';
  c.beginPath();
  for (const [a, b] of visibleMeshEdges(screen, mesh.faces, mesh.details, {
    perspective: false,
    faceEdges: mode === 'vector',
  })) {
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
  }
  c.stroke();
  if (decorations) {
    c.fillStyle = '#759268';
    c.font = '10px Consolas,monospace';
    c.textAlign = 'left';
    c.fillText((model ? 'TARGET / ' : 'AIRFRAME / ') + spec.id.toUpperCase(), 15, h - 15);
    c.textAlign = 'right';
    c.fillText(mode === 'vector' ? 'VECTOR MODEL' : 'SURFACE PREVIEW', w - 15, h - 15);
    c.textAlign = 'left';
  }
}

export function renderTargetPreview(canvas, mission, player, time, mode = 'vector') {
  const mesh =
    mission.id === 'ballistic'
      ? groundMesh('ballistic')
      : mission.id === 'city-building'
        ? groundMesh('city-building', 80)
        : mission.kind === 'air'
          ? aircraftMesh(enemyAircraft(mission, player).id)
          : mission.objective === 'landing'
            ? groundMesh('airbase')
            : groundMesh(mission.id);
  renderAircraftPreview(canvas, mission, time, mesh, mode);
}
