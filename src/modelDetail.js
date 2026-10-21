// Keep the actual projected silhouette when internal details are subpixel.
export function silhouetteIndices(points) {
  const sorted = points
      .map((p, i) => ({ ...p, i }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x || a.y - b.y),
    cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (items) => {
    const out = [];
    for (const p of items) {
      while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop();
      out.push(p);
    }
    return out;
  };
  if (sorted.length < 3) return sorted.map((p) => p.i);
  return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)].map(
    (p) => p.i,
  );
}
