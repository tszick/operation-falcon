// The fixed airframe panel is projected through the same field of view as the pilot.
export function cockpitHeight(width, height) {
  return height * 0.25;
}
export function cockpitHudFooterY(width, height) {
  return Math.min(
    height * 0.53 + (height < 650 ? 80 : 145),
    height - cockpitHeight(width, height) - 24,
  );
}
// Keep homogeneous coordinates through the camera plane. CSS clips negative W;
// dropping the whole panel when just one corner is behind the eye causes popping.
export function cockpitProjection(width, height, yaw = 0, pitch = 0) {
  const focal = height * 0.8,
    cx = width / 2,
    y0 = height * 0.53 - height + cockpitHeight(width, height);
  const sy = Math.sin(yaw),
    cy = Math.cos(yaw),
    sp = Math.sin(pitch),
    cp = Math.cos(pitch);
  const dx = cp * sy,
    dy = -sp,
    dc = sp * y0 + cp * (cy * focal - sy * cx);
  const rx = -cy * cx - sy * focal,
    ry = cp * y0 - sp * (cy * focal - sy * cx);
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
