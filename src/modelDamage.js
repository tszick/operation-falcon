import { Vec3 } from './math.js';
const masks = new WeakMap();
export function wingMasks(mesh) {
  let value = masks.get(mesh);
  if (!value) {
    value = {
      left: new Set(mesh.wingPoints?.left || []),
      right: new Set(mesh.wingPoints?.right || []),
    };
    masks.set(mesh, value);
  }
  return value;
}
export function vertexWingHealth(mesh, index, condition) {
  const mask = wingMasks(mesh);
  return mask.left.has(index)
    ? (condition?.parts.leftWing ?? 1)
    : mask.right.has(index)
      ? (condition?.parts.rightWing ?? 1)
      : 1;
}
export function damagedVertex(mesh, index, condition) {
  const p = mesh.points[index],
    health = vertexWingHealth(mesh, index, condition);
  if (health >= 0.8) return p;
  const outer = Math.max(0, Math.abs(p.x) - 1.2);
  return new Vec3(
    Math.sign(p.x) * (Math.min(1.2, Math.abs(p.x)) + outer * (0.15 + 0.85 * health)),
    p.y - outer * (1 - health) * 0.3,
    p.z,
  );
}
export const modelFacePresent = (mesh, ids, condition) =>
  !condition || ids.some((i) => vertexWingHealth(mesh, i, condition) >= 0.09);
