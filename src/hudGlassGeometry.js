// One physical plane is shared by the combiner frame and its live display.
export const hudGlassDepth = 1.06;
export function hudGlassPoints(aspect) {
  const width = (aspect * 0.2) / 0.8;
  return [
    [-width * 0.85, 0.43, hudGlassDepth],
    [width * 0.85, 0.43, hudGlassDepth],
    [width, -0.22, hudGlassDepth],
    [-width, -0.22, hudGlassDepth],
  ];
}
export function hudGlassScreenPoints(width, height) {
  const f = height * 0.8;
  return hudGlassPoints(width / height).map(([x, y, z]) => [
    width * 0.5 + (f * x) / z,
    height * 0.53 - (f * y) / z,
  ]);
}
