// Static terrain buffers share the model renderer's WebGL context.
// Fill and wire passes use one depth buffer, so slopes remain opaque.
export function terrainBuffers(faces) {
  const fills = new Float32Array(faces.length * 18),
    edges = [],
    ids = new Map();
  let offset = 0;
  for (const face of faces) {
    const color = face.color
      .match(/[\d.]+/g)
      .map(Number)
      .map((v) => v / 255);
    for (const p of face.points)
      for (const value of [p.x, p.y, p.z, ...color]) fills[offset++] = value;
    for (let i = 0; i < 3; i++) {
      const a = face.points[i],
        b = face.points[(i + 1) % 3];
      let ai = ids.get(a),
        bi = ids.get(b);
      if (ai === undefined) {
        ai = ids.size;
        ids.set(a, ai);
      }
      if (bi === undefined) {
        bi = ids.size;
        ids.set(b, bi);
      }
      edges.push({ a, b, key: ai < bi ? ai + ':' + bi : bi + ':' + ai });
    }
  }
  const seen = new Set(),
    lines = [];
  for (const { a, b, key } of edges)
    if (!seen.has(key)) {
      seen.add(key);
      lines.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  return { fills, lines: new Float32Array(lines) };
}
