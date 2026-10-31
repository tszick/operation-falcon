// Packed terrain data is prepared once per rebuild, optionally off the main thread.
export function terrainBuffers(faces, { wire = true } = {}) {
  const fills = new Float32Array(faces.length * 18),
    lines = [],
    ids = new Map(),
    seen = new Set(),
    colors = new Map();
  const capacity = faces.length * 3 + 1;
  let offset = 0;
  for (const face of faces) {
    let color = colors.get(face.color);
    if (!color) {
      color = face.color
        .match(/[\d.]+/g)
        .map(Number)
        .map((v) => v / 255);
      colors.set(face.color, color);
    }
    for (const p of face.points) {
      fills[offset++] = p.x;
      fills[offset++] = p.y;
      fills[offset++] = p.z;
      fills[offset++] = color[0];
      fills[offset++] = color[1];
      fills[offset++] = color[2];
    }
    if (!wire) continue;
    for (let i = 0; i < 3; i++) {
      const a = face.points[i],
        b = face.points[(i + 1) % 3];
      if (!ids.has(a)) ids.set(a, ids.size);
      if (!ids.has(b)) ids.set(b, ids.size);
      const ai = ids.get(a),
        bi = ids.get(b),
        key = Math.min(ai, bi) * capacity + Math.max(ai, bi);
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  return { fills, lines: new Float32Array(lines) };
}
export function packedTerrainBuffers(faces, { wire = true } = {}) {
  const data = terrainBuffers(faces, { wire }),
    mask = new Float32Array(faces.length * 15),
    gpuLines = new Float32Array(data.lines.length * 2);
  let cursor = 0;
  for (const face of faces)
    for (const p of face.points) {
      mask[cursor++] = p.x;
      mask[cursor++] = p.y;
      mask[cursor++] = p.z;
      cursor += 2;
    }
  for (let i = 0; i < data.lines.length / 3; i++)
    gpuLines.set(data.lines.subarray(i * 3, i * 3 + 3), i * 6);
  return { ...data, mask, gpuLines, faceCount: faces.length };
}
