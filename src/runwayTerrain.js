import { Vec3 } from './math.js';
// Cut the terrain along each flat landing strip. Merely sampling its corners on
// a world-aligned grid cannot preserve a narrow rotated strip at coarse LOD.
export function createRunwayTerrainClipper(fields) {
  const strips = fields.map((field) => {
    const c = Math.cos(field.heading || 0),
      s = Math.sin(field.heading || 0);
    const dx = Math.abs(c) * 70 + Math.abs(s) * 1800;
    const dz = Math.abs(s) * 70 + Math.abs(c) * 1800;
    return {
      ...field,
      c,
      s,
      minX: field.x - dx,
      maxX: field.x + dx,
      minZ: field.z - dz,
      maxZ: field.z + dz,
    };
  });
  return (triangle) => {
    let triangles = [triangle];
    for (const field of strips) {
      // Most terrain cells are nowhere near a strip. Avoid clipping allocations there.
      if (
        triangle.every((p) => p.x < field.minX) ||
        triangle.every((p) => p.x > field.maxX) ||
        triangle.every((p) => p.z < field.minZ) ||
        triangle.every((p) => p.z > field.maxZ)
      )
        continue;
      const { c, s } = field;
      const local = (p) => ({
        x: (p.x - field.x) * c - (p.z - field.z) * s,
        z: (p.x - field.x) * s + (p.z - field.z) * c,
      });
      const inStrip = (p) => {
        const v = local(p);
        return Math.abs(v.x) <= 70.00001 && Math.abs(v.z) <= 1800.00001;
      };
      const result = [];
      const emit = (polygon) => {
        for (let i = 1; i + 1 < polygon.length; i++) {
          const a = polygon[0],
            b = polygon[i],
            d = polygon[i + 1];
          if (Math.abs((b.x - a.x) * (d.z - a.z) - (b.z - a.z) * (d.x - a.x)) > 1e-7)
            result.push([a, b, d]);
        }
      };
      for (const points of triangles) {
        const coords = points.map(local);
        if (
          Math.min(...coords.map((p) => p.x)) >= 70 ||
          Math.max(...coords.map((p) => p.x)) <= -70 ||
          Math.min(...coords.map((p) => p.z)) >= 1800 ||
          Math.max(...coords.map((p) => p.z)) <= -1800 ||
          points.every((p) => Math.abs(p.y - field.elevation) < 1e-8)
        ) {
          result.push(points);
          continue;
        }
        let remaining = points;
        for (const [axis, sign, bound] of [
          ['x', 1, 70],
          ['x', -1, 70],
          ['z', 1, 1800],
          ['z', -1, 1800],
        ]) {
          if (!remaining.length) break;
          const inside = [],
            outside = [];
          for (let i = 0; i < remaining.length; i++) {
            const a = remaining[i],
              b = remaining[(i + 1) % remaining.length];
            const da = bound - sign * local(a)[axis],
              db = bound - sign * local(b)[axis];
            (da >= 0 ? inside : outside).push(a);
            if (da >= 0 !== db >= 0) {
              const t = da / (da - db);
              const p = new Vec3(
                a.x + (b.x - a.x) * t,
                a.y + (b.y - a.y) * t,
                a.z + (b.z - a.z) * t,
              );
              if (inStrip(p)) p.y = field.elevation;
              inside.push(p);
              outside.push(p);
            }
          }
          emit(outside);
          remaining = inside;
        }
        emit(remaining.map((p) => new Vec3(p.x, field.elevation, p.z)));
      }
      triangles = result;
    }
    return triangles;
  };
}
