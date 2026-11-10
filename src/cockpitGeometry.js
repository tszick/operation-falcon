import { hudGlassDepth } from './hudGlassGeometry.js';
// The fixed airframe panel is projected through the same field of view as the pilot.
export function cockpitHeight(width, height) {
  return height * 0.25;
}
export function cockpitHudFooterY(width, height) {
  return Math.min(
    height * 0.53 + (height < 650 ? 80 : 145),
    height - cockpitHeight(width, height) - 24,
    height * 0.53 + (height * 0.8 * 0.22) / hudGlassDepth - 26,
  );
}
// Leave room for both value boxes inside the narrow top of the glass.
export function hudTapeSpan(width) {
  return Math.min(210, width * 0.2, (width * 0.17) / hudGlassDepth - 44);
}
// Keep homogeneous coordinates through the camera plane. CSS clips negative W;
// dropping the whole panel when just one corner is behind the eye causes popping.
export function cockpitProjection(width, height, yaw = 0, pitch = 0, eye = [0, 0, 0]) {
  const focal = height * 0.8,
    cx = width / 2,
    y0 = height * 0.53 - height + cockpitHeight(width, height);
  const sy = Math.sin(yaw),
    cy = Math.cos(yaw),
    sp = Math.sin(pitch),
    cp = Math.cos(pitch);
  const centerX = cx + focal * eye[0],
    originY = y0 - focal * eye[1],
    depth = focal * (1 - eye[2]);
  const dx = cp * sy,
    dy = -sp,
    dc = sp * originY + cp * (cy * depth - sy * centerX);
  const rx = -cy * centerX - sy * depth,
    ry = cp * originY - sp * (cy * depth - sy * centerX);
  return [
    (cx * dx) / focal + cy,
    (y0 * dx) / focal + sp * sy,
    0,
    dx / focal,
    (cx * dy) / focal,
    (y0 * dy) / focal + cp,
    0,
    dy / focal,
    0,
    0,
    1,
    0,
    (cx * dc) / focal + rx,
    (y0 * dc) / focal - ry,
    0,
    dc / focal,
  ];
}
// Full homogeneous projection of the same plane as the cabin HUD glass.
// Keeping W per point is essential: a translated or tangent-affine display
// cannot stay attached to all four corners during combined head rotation.
export function hudViewTransform(width, height, yaw = 0, pitch = 0, eye = [0, 0, 0]) {
  const f = height * 0.8,
    cx = width * 0.5,
    cy = height * 0.53,
    z = hudGlassDepth,
    sy = Math.sin(yaw),
    cosy = Math.cos(yaw),
    sp = Math.sin(pitch),
    cp = Math.cos(pitch);
  const project = (x, y) => {
    const px = ((x - cx) / f) * z - eye[0],
      py = ((cy - y) / f) * z - eye[1],
      pz = z - eye[2],
      rx = cosy * px - sy * pz,
      rz = sy * px + cosy * pz,
      ry = cp * py - sp * rz,
      depth = sp * py + cp * rz;
    return [cx * depth + f * rx, cy * depth - f * ry, depth];
  };
  const origin = project(0, 0),
    x = project(1, 0).map((v, i) => v - origin[i]),
    y = project(0, 1).map((v, i) => v - origin[i]);
  return [x[0], x[1], 0, x[2], y[0], y[1], 0, y[2], 0, 0, 1, 0, origin[0], origin[1], 0, origin[2]];
}
export function hudSourcePoint(m, point) {
  const a = m[0] - point.x * m[3],
    b = m[4] - point.x * m[7],
    c = m[1] - point.y * m[3],
    d = m[5] - point.y * m[7],
    e = point.x * m[15] - m[12],
    f = point.y * m[15] - m[13],
    det = a * d - b * c;
  if (Math.abs(det) < 1e-9) return point;
  return { x: (e * d - b * f) / det, y: (a * f - e * c) / det };
}
export function homography(width, height, points) {
  const source = [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ],
    rows = [];
  source.forEach(([x, y], i) => {
    const [u, v] = points[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++)
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const div = rows[col][col];
    if (Math.abs(div) < 1e-9) throw new Error('Degenerate cockpit screen');
    for (let k = col; k <= 8; k++) rows[col][k] /= div;
    for (let row = 0; row < 8; row++)
      if (row !== col) {
        const f = rows[row][col];
        for (let k = col; k <= 8; k++) rows[row][k] -= f * rows[col][k];
      }
  }
  return rows.map((r) => r[8]);
}
export function matrix3d(h) {
  return [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, 1];
}
