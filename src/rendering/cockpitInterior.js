import { orderCabinSurfaces } from '../cabinOcclusion.js';
import {
  cockpitInteriorGeometry,
  projectCabinShape,
  cabinCameraRotation,
} from '../cockpitInteriorGeometry.js';
const namespace = 'http://www.w3.org/2000/svg';
const scenes = new WeakMap();
export function mountCockpitInterior(ui, doc = document) {
  const svg = doc.createElementNS(namespace, 'svg');
  svg.id = 'cockpit-interior';
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'none');
  ui.append(svg);
  return svg;
}
export function updateCockpitInterior(svg, width, height, yaw, pitch) {
  if (!svg) return;
  let scene = scenes.get(svg);
  const size = `${width}:${height}`;
  if (scene?.size !== size) {
    const records = orderCabinSurfaces(cockpitInteriorGeometry(width / height)).map(
      (shape, index) => {
        const node = svg.ownerDocument.createElementNS(namespace, 'path');
        node.setAttribute('data-cabin-part', shape.part);
        node.setAttribute('fill', shape.fill);
        node.setAttribute('stroke', shape.stroke);
        node.setAttribute('stroke-width', String(shape.width));
        node.setAttribute('stroke-linejoin', 'round');
        return { shape, node, index };
      },
    );
    scene = { size, records };
    scenes.set(svg, scene);
    svg.replaceChildren(...records.map((r) => r.node));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
  const key = `${yaw.toFixed(4)}:${pitch.toFixed(4)}`;
  if (scene.view === key) return;
  scene.view = key;
  const visible = [];
  const rotation = cabinCameraRotation(yaw, pitch);
  for (const record of scene.records) {
    const projection = projectCabinShape(record.shape, width, height, yaw, pitch, rotation);
    record.node.style.display = projection ? '' : 'none';
    if (!projection) continue;
    const points = projection.points;
    const d =
      points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('') +
      (record.shape.open ? '' : 'Z');
    record.node.setAttribute('d', d);
    visible.push(record);
  }
  const order = visible.map((r) => r.index).join(',');
  if (scene.order !== order) {
    svg.replaceChildren(...visible.map((r) => r.node));
    scene.order = order;
  }
}
