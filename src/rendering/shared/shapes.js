// CPU-side shape preparation; rasterisation and compositing are performed by WebGPU.
export function rgba(value) {
  if (Array.isArray(value)) return value;
  value = String(value).trim();
  if (value === 'transparent' || value === 'none') return [0, 0, 0, 0];
  const named = {
    white: '#ffffff',
    black: '#000000',
    red: '#ff0000',
    green: '#008000',
    blue: '#0000ff',
    yellow: '#ffff00',
    orange: '#ffa500',
  };
  value = named[value] || value;
  if (value[0] === '#') {
    let h = value.slice(1);
    if (h.length <= 4) h = [...h].map((x) => x + x).join('');
    if (h.length === 6) h += 'ff';
    return [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  const numbers = value.match(/[-\d.]+/g)?.map(Number) || [];
  if (value.startsWith('hsl')) {
    const [h, s, l] = [numbers[0] / 360, numbers[1] / 100, numbers[2] / 100];
    const f = (n) => {
      const k = (n + h * 12) % 12;
      return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4), numbers[3] ?? 1];
  }
  return numbers.length >= 3
    ? [numbers[0] / 255, numbers[1] / 255, numbers[2] / 255, numbers[3] ?? 1]
    : [1, 1, 1, 1];
}
export function transformPoint(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
export function multiply(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export function triangulate(points) {
  const p = points.filter(
    (a, i) => i === 0 || Math.hypot(a[0] - points[i - 1][0], a[1] - points[i - 1][1]) > 1e-7,
  );
  if (p.length > 2 && Math.hypot(p[0][0] - p.at(-1)[0], p[0][1] - p.at(-1)[1]) < 1e-7) p.pop();
  const out = [],
    ids = p.map((_, i) => i);
  const area = p.reduce(
      (s, a, i) => s + a[0] * p[(i + 1) % p.length][1] - a[1] * p[(i + 1) % p.length][0],
      0,
    ),
    sign = area < 0 ? -1 : 1;
  let guard = p.length * p.length;
  while (ids.length > 2 && guard-- > 0) {
    let found = false;
    for (let i = 0; i < ids.length; i++) {
      const ai = ids[(i + ids.length - 1) % ids.length],
        bi = ids[i],
        ci = ids[(i + 1) % ids.length],
        a = p[ai],
        b = p[bi],
        c = p[ci];
      if (cross(a, b, c) * sign <= 1e-8) continue;
      if (
        ids.some(
          (j) =>
            j !== ai &&
            j !== bi &&
            j !== ci &&
            cross(a, b, p[j]) * sign >= 0 &&
            cross(b, c, p[j]) * sign >= 0 &&
            cross(c, a, p[j]) * sign >= 0,
        )
      )
        continue;
      out.push(a, b, c);
      ids.splice(i, 1);
      found = true;
      break;
    }
    if (!found) break;
  }
  return out;
}
