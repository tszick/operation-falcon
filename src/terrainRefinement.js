// Local adaptive terrain detail with conforming shared edges: no global dense grid,
// overlapping terrain sheets or cracks where a vehicle patch meets the coarse mesh.
export function refinedTerrainTriangles(xs, zs, point, patches) {
  const cells = [];
  function split(x0, x1, z0, z1) {
    const nearby = patches.some(
      (p) =>
        p.x + p.radius > x0 && p.x - p.radius < x1 && p.z + p.radius > z0 && p.z - p.radius < z1,
    );
    if (nearby && (x1 - x0 > 30 || z1 - z0 > 30)) {
      const xm = (x0 + x1) * 0.5,
        zm = (z0 + z1) * 0.5;
      split(x0, xm, z0, zm);
      split(xm, x1, z0, zm);
      split(x0, xm, zm, z1);
      split(xm, x1, zm, z1);
    } else cells.push({ x0, x1, z0, z1 });
  }
  for (let z = 0; z < zs.length - 1; z++)
    for (let x = 0; x < xs.length - 1; x++) split(xs[x], xs[x + 1], zs[z], zs[z + 1]);
  const horizontal = new Map(),
    vertical = new Map();
  const put = (map, key, a, b) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(a).add(b);
  };
  for (const { x0, x1, z0, z1 } of cells) {
    put(horizontal, z0, x0, x1);
    put(horizontal, z1, x0, x1);
    put(vertical, x0, z0, z1);
    put(vertical, x1, z0, z1);
  }
  for (const map of [horizontal, vertical])
    for (const [key, values] of map)
      map.set(
        key,
        [...values].sort((a, b) => a - b),
      );
  const between = (values, lo, hi) => {
    let left = 0,
      right = values.length;
    while (left < right) {
      const mid = (left + right) >> 1;
      if (values[mid] < lo) left = mid + 1;
      else right = mid;
    }
    const result = [];
    for (let i = left; i < values.length && values[i] <= hi; i++) result.push(values[i]);
    return result;
  };
  const triangles = [];
  for (const { x0, x1, z0, z1 } of cells) {
    const bottom = between(horizontal.get(z0), x0, x1).map((x) => point(x, z0)),
      right = between(vertical.get(x1), z0, z1)
        .slice(1)
        .map((z) => point(x1, z)),
      top = between(horizontal.get(z1), x0, x1)
        .reverse()
        .slice(1)
        .map((x) => point(x, z1)),
      left = between(vertical.get(x0), z0, z1)
        .reverse()
        .slice(1, -1)
        .map((z) => point(x0, z)),
      boundary = [...bottom, ...right, ...top, ...left];
    if (boundary.length === 4) {
      triangles.push(
        [boundary[0], boundary[1], boundary[2]],
        [boundary[0], boundary[2], boundary[3]],
      );
    } else {
      const center = point((x0 + x1) * 0.5, (z0 + z1) * 0.5);
      for (let i = 0; i < boundary.length; i++)
        triangles.push([center, boundary[i], boundary[(i + 1) % boundary.length]]);
    }
  }
  return triangles;
}
