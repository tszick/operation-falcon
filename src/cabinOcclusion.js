// Static-eye BSP painter ordering. Head rotation changes projection, not which
// surface is in front of another. Split crossings once instead of re-sorting
// whole consoles by their camera-space centre each animation frame.
const epsilon = 1e-6;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function planeFor(points) {
  const a = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const u = points[i].map((v, k) => v - a[k]),
      v = points[i + 1].map((v, k) => v - a[k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...n);
    if (length > 1e-10) {
      const normal = n.map((v) => v / length);
      return { normal, d: dot(normal, a) };
    }
  }
  return null;
}
const distance = (plane, p) => dot(plane.normal, p) - plane.d;
function side(shape, plane) {
  let front = false,
    back = false;
  for (const p of shape.points) {
    const d = distance(plane, p);
    front ||= d > epsilon;
    back ||= d < -epsilon;
  }
  return front && back ? 'split' : front ? 'front' : back ? 'back' : 'coplanar';
}
function split(shape, plane) {
  if (shape.open) {
    const [a, b] = shape.points,
      da = distance(plane, a),
      db = distance(plane, b);
    const t = da / (da - db),
      p = a.map((v, i) => v + (b[i] - v) * t);
    const first = { ...shape, points: [a, p] },
      second = { ...shape, points: [p, b] };
    return da > 0 ? [first, second] : [second, first];
  }
  const front = [],
    back = [];
  for (let i = 0; i < shape.points.length; i++) {
    const a = shape.points[i],
      b = shape.points[(i + 1) % shape.points.length],
      da = distance(plane, a),
      db = distance(plane, b);
    if (da >= -epsilon) front.push(a);
    if (da <= epsilon) back.push(a);
    if ((da > epsilon && db < -epsilon) || (da < -epsilon && db > epsilon)) {
      const t = da / (da - db),
        p = a.map((v, k) => v + (b[k] - v) * t);
      front.push(p);
      back.push(p);
    }
  }
  return [
    { ...shape, points: front },
    { ...shape, points: back },
  ];
}
function choosePlane(shapes) {
  let best = null,
    score = Infinity;
  const candidates = shapes.filter((shape) => !shape.open);
  const stride = Math.max(1, Math.floor(candidates.length / 12));
  for (let i = 0; i < candidates.length; i += stride) {
    const plane = planeFor(candidates[i].points);
    if (!plane) continue;
    let front = 0,
      back = 0,
      crossings = 0;
    for (const shape of shapes) {
      const s = side(shape, plane);
      front += s === 'front';
      back += s === 'back';
      crossings += s === 'split';
    }
    const cost = crossings * 4 + Math.abs(front - back) * 0.2;
    if (cost < score) {
      score = cost;
      best = plane;
    }
  }
  return best;
}
export function orderCabinSurfaces(shapes, eye = [0, 0, 0]) {
  const result = [];
  const visit = (polygons) => {
    if (!polygons.length) return;
    const plane = choosePlane(polygons);
    if (!plane) {
      result.push(...polygons);
      return;
    }
    const front = [],
      back = [],
      coplanar = [];
    for (const shape of polygons) {
      const s = side(shape, plane);
      if (s === 'split') {
        const [f, b] = split(shape, plane);
        front.push(f);
        back.push(b);
      } else if (s === 'front') front.push(shape);
      else if (s === 'back') back.push(shape);
      else coplanar.push(shape);
    }
    const eyeInFront = distance(plane, eye) >= 0;
    visit(eyeInFront ? back : front);
    result.push(...coplanar);
    visit(eyeInFront ? front : back);
  };
  const planar = shapes
    .filter((s) => s.frontFacing !== false)
    .flatMap((shape) => {
      // An unfilled outline has no interior surface. Partition its original
      // edges as open segments so BSP cuts never become visible diagonals.
      if (shape.fill === 'none' && !shape.open)
        return shape.points.map((p, i) => ({
          ...shape,
          open: true,
          points: [p, shape.points[(i + 1) % shape.points.length]],
        }));
      if (shape.open) return [shape];
      const plane = planeFor(shape.points);
      if (!plane || shape.points.every((p) => Math.abs(distance(plane, p)) <= epsilon))
        return [shape];
      return shape.points
        .slice(1, -1)
        .map((p, i) => ({ ...shape, points: [shape.points[0], p, shape.points[i + 2]] }));
    });
  visit(planar);
  return result;
}
