// Decode the supported multiplayer terrain schema into fresh, typed values.
// Arbitrary network properties must never be spread into the shared terrain world.
function numbers(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid terrain object');
  const out = {};
  for (const key of keys)
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'number' || !Number.isFinite(value[key]))
        throw new Error('Invalid terrain number');
      out[key] = Number(value[key]);
    }
  return out;
}
function list(value, decode) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 128) throw new Error('Invalid terrain list');
  return value.map(decode);
}
function route(value, kind) {
  if (value == null) return null;
  return {
    ...numbers(value, ['x', 'z', 'angle', 'bend', 'phase', 'width', 'level', 'depth']),
    detours: list(value.detours, (d) => numbers(d, ['along', 'spread', 'offset'])),
    keepAnchor: value.keepAnchor === true,
    ...(kind === 'road' ? { bridgeKey: 'road' } : {}),
  };
}
export function decodeWorld(value) {
  const out = {
    ...numbers(value, ['revision', 'skySeed']),
    river: route(value.river, 'river'),
    road: route(value.road, 'road'),
    canyon: route(value.canyon, 'canyon'),
    peaks: list(value.peaks, (p) => numbers(p, ['x', 'z', 'height', 'radius', 'platform'])),
  };
  if (value.surface !== undefined) {
    const surface = ['grass', 'winter'].find((s) => s === value.surface);
    if (!surface) throw new Error('Unsupported multiplayer surface');
    out.surface = surface;
  }
  if (value.weather)
    out.weather = {
      ...numbers(value.weather, ['gust', 'turbulence', 'shear', 'seed']),
      wind: numbers(value.weather.wind, ['x', 'y', 'z']),
    };
  if (value.bridge !== undefined)
    out.bridge =
      value.bridge == null
        ? null
        : numbers(value.bridge, ['x', 'z', 'heading', 'length', 'width', 'deckY', 'span']);
  if (value.site !== undefined)
    out.site = value.site == null ? null : numbers(value.site, ['x', 'z', 'height']);
  if (value.airfields)
    out.airfields = list(value.airfields, (f) => numbers(f, ['x', 'z', 'elevation', 'heading']));
  if (value.bridges)
    out.bridges = list(value.bridges, (b, index) => ({
      ...numbers(b, ['along', 'from', 'to', 'x', 'z', 'span', 'heading', 'deckY', 'width']),
      pathKey: 'road',
      id: 'ROAD-BRIDGE-road-' + (index + 1),
      alive: b.alive === true,
    }));
  if (value.bridgeRevision !== undefined)
    out.bridgeRevision = numbers(value, ['bridgeRevision']).bridgeRevision;
  return out;
}
