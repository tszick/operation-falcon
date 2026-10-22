const boundsCache = new WeakMap();
// Meshes are immutable snapshots; changing flap/sweep geometry creates a new mesh.
export function meshBounds(mesh) {
  let bounds = boundsCache.get(mesh);
  if (bounds) return bounds;
  const mins = [Infinity, Infinity, Infinity],
    maxs = [-Infinity, -Infinity, -Infinity];
  let radius = 0;
  for (const p of mesh.points) {
    const coordinates = [p.x, p.y, p.z];
    for (let i = 0; i < 3; i++) {
      mins[i] = Math.min(mins[i], coordinates[i]);
      maxs[i] = Math.max(maxs[i], coordinates[i]);
    }
    radius = Math.max(radius, Math.hypot(p.x, p.y, p.z));
  }
  bounds = {
    mins,
    sizes: maxs.map((value, i) => Math.max(0.01, value - mins[i])),
    radius: mesh.radius || radius,
  };
  boundsCache.set(mesh, bounds);
  return bounds;
}
export function rotationMatrix(q) {
  const { x, y, z, w } = q;
  return new Float32Array([
    1 - 2 * (y * y + z * z),
    2 * (x * y + z * w),
    2 * (x * z - y * w),
    2 * (x * y - z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z + x * w),
    2 * (x * z + y * w),
    2 * (y * z - x * w),
    1 - 2 * (x * x + y * y),
  ]);
}
export function meshBuffers(mesh) {
  const vertices = new Float32Array(mesh.points.length * 5),
    left = new Set(mesh.wingPoints?.left || []),
    right = new Set(mesh.wingPoints?.right || []),
    triangles = [],
    flaps = [],
    edges = [],
    seen = new Set();
  mesh.points.forEach((p, i) =>
    vertices.set([p.x, p.y, p.z, left.has(i) ? 1 : 0, right.has(i) ? 1 : 0], i * 5),
  );
  const edge = (a, b) => {
    const pa = mesh.points[a],
      pb = mesh.points[b],
      key = [[pa.x, pa.y, pa.z].join(','), [pb.x, pb.y, pb.z].join(',')].sort().join('|');
    if (!seen.has(key)) {
      seen.add(key);
      edges.push(a, b);
    }
  };
  for (const face of mesh.faces || []) {
    const destination =
      mesh.flapFraction > 0.02 && mesh.flapFaces?.includes(face) ? flaps : triangles;
    for (let j = 1; j < face.length - 1; j++) destination.push(face[0], face[j], face[j + 1]);
    face.forEach((id, j) => edge(id, face[(j + 1) % face.length]));
  }
  for (const [a, b] of mesh.faces ? mesh.details || [] : mesh.edges || []) edge(a, b);
  return {
    vertices,
    triangles: new Uint32Array([...triangles, ...flaps]),
    flapCount: flaps.length,
    edges: new Uint32Array(edges),
    details: new Uint32Array((mesh.faces ? mesh.details || [] : mesh.edges || []).flat()),
  };
}
