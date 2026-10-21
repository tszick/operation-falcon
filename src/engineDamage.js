import { airframes } from './airframes.js';
import { clamp } from './math.js';
const layouts = new Map();
export function engineLayout(spec) {
  const count = spec.engineCount || 1,
    key = spec.id + ':' + count;
  if (layouts.has(key)) return layouts.get(key);
  const model = airframes[spec.id] || {},
    xs =
      count === 1
        ? [0]
        : model.engineXs
          ? model.engineXs.flatMap((x) => [-x, x])
          : Array.from({ length: count }, (_, i) => (i % 2 ? 1 : -1) * (model.engineX || 1));
  const result = xs.slice(0, count).map((x, index) => ({
    index,
    x,
    y: model.engineY ?? -0.25,
    z: ((model.engineFront || 0) + (model.engineBack || -4)) / 2,
    side: x <= 0 ? 'left' : 'right',
    wing: model.engineMount === 'wing' ? (x < 0 ? 'left' : 'right') : null,
  }));
  layouts.set(key, result);
  return result;
}
export function publishEngines(spec, d) {
  let left = 0,
    right = 0,
    nl = 0,
    nr = 0;
  for (const e of engineLayout(spec)) {
    if (e.side === 'left') {
      left += d.engines[e.index];
      nl++;
    } else {
      right += d.engines[e.index];
      nr++;
    }
  }
  d.parts.engineLeft = nl ? left / nl : 1;
  d.parts.engineRight = nr ? right / nr : 1;
  const snapshot = d.engineSnapshot || (d.engineSnapshot = [1, 1]);
  snapshot[0] = d.parts.engineLeft;
  snapshot[1] = d.parts.engineRight;
}
export function syncEngines(spec, d) {
  const layout = engineLayout(spec);
  if (!d.engines || d.engines.length !== layout.length)
    d.engines = layout.map((e) => d.parts[e.side === 'left' ? 'engineLeft' : 'engineRight'] ?? 1);
  else if (d.engineSnapshot)
    for (const [i, key] of ['engineLeft', 'engineRight'].entries())
      if (Math.abs(d.parts[key] - d.engineSnapshot[i]) > 1e-9)
        for (const e of layout)
          if (e.side === (i ? 'right' : 'left')) d.engines[e.index] = clamp(d.parts[key], 0, 1);
  for (const e of layout)
    if (e.wing && (d.parts[e.wing + 'Wing'] ?? 1) < 0.09) d.engines[e.index] = 0;
  publishEngines(spec, d);
  return d.engines;
}
export const enginePower = (integrity) => (integrity <= 0.12 ? 0 : clamp(integrity, 0, 1) ** 1.5);
export function engineResponse(spec, d) {
  const health = syncEngines(spec, d),
    powers = health.map(enginePower);
  return {
    health,
    powers,
    available: powers.reduce((a, b) => a + b, 0) / powers.length,
    operating: powers.filter((v) => v > 0).length,
    count: powers.length,
  };
}
