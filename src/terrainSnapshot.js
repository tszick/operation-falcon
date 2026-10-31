// Worker messages carry geometry only. Build fresh records from finite numbers and
// booleans; never install arbitrary message objects into shared mission state.
function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Expected a geometry record');
  return value;
}
function number(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e9)
    throw new TypeError('Invalid geometry number');
  return Number(value);
}
function fields(value, names) {
  const input = record(value),
    result = {};
  for (const name of names.split(' '))
    if (input[name] !== undefined) result[name] = number(input[name]);
  return result;
}
function list(value, read, max = 1024) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw new TypeError('Invalid geometry list');
  return value.map(read);
}
function path(value) {
  if (value == null) return null;
  const input = record(value),
    result = fields(input, 'x z angle bend phase width level depth min max');
  result.training = input.training === true;
  result.keepAnchor = input.keepAnchor === true;
  result.detours = list(input.detours, (d) => fields(d, 'along spread offset'));
  return result;
}
export function readTerrainSnapshot(value) {
  const input = record(value);
  return {
    revision: number(input.revision),
    noAirfield: input.noAirfield === true,
    ocean: input.ocean === true,
    river: path(input.river),
    road: path(input.road),
    canyon: path(input.canyon),
    peaks: list(input.peaks, (p) => fields(p, 'x z height radius platform')),
    airfields: list(input.airfields, (p) => fields(p, 'x z elevation heading')),
    islands: list(input.islands, (p) => {
      const island = fields(p, 'x z radiusX radiusZ radius heading height phase plateau');
      if (p.landColor !== undefined) {
        island.landColor = list(p.landColor, number, 3);
        if (island.landColor.length !== 3) throw new TypeError('Invalid island colour');
      }
      return island;
    }),
    site: input.site == null ? null : fields(input.site, 'x z height'),
  };
}
function key(value) {
  if (typeof value !== 'string' || value.length > 65536 || !/^[a-zA-Z0-9:;.,+_-]*$/.test(value))
    throw new TypeError('Invalid geometry job key');
  return value;
}
const point = (p) => ({ x: number(record(p).x), y: number(p.y), z: number(p.z) });
function header(value) {
  const input = record(value);
  return {
    key: key(input.key),
    revision: number(input.revision),
    world: readTerrainSnapshot(input.world),
  };
}
export function readTerrainJob(value) {
  return {
    ...header(value),
    cx: number(value.cx),
    cz: number(value.cz),
    wire: value.wire !== false,
    patches: list(value.patches, (p) => fields(p, 'x z radius'), 4096),
  };
}
export function readVisibilityJob(value) {
  return {
    ...header(value),
    windowKey: key(value.windowKey),
    camera: point(value.camera),
    points: list(value.points, (p) => (p === null ? null : point(p)), 8192),
  };
}
