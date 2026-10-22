import { missionLocation } from './missionLocations.js';
// Experimental palettes and small local textures. No network assets or geometry changes.
const style = (options) => ({
  texture: 'terrain',
  rock: [0.36, 0.35, 0.31],
  rockiness: 0.6,
  snow: 0,
  snowLine: 1000,
  snowRange: 600,
  textureScale: 700,
  hazeDistance: 38000,
  ...options,
});
export const surfaceStyles = {
  vector: style({
    label: 'Eredeti vektoros',
    sky: ['#081619', '#23392d', '#07100c'],
    terrain: [0.06, 0.14, 0.09],
    stars: 1,
    light: 1,
  }),
  ocean: style({
    label: 'Nappali nyílt tenger',
    sky: ['#245d9b', '#779eaf', '#66889a'],
    terrain: [0.1, 0.3, 0.42],
    rockiness: 0,
    stars: 0,
    light: 1,
    texture: 'terrain-sea',
    textureScale: 240,
    hazeDistance: 45000,
  }),
  grass: style({
    label: 'Füves táj · kék ég',
    sky: ['#245482', '#8ab4c3', '#b6c6b4'],
    terrain: [0.28, 0.38, 0.18],
    stars: 0,
    light: 1,
  }),
  desert: style({
    label: 'Sivatag · poros ég',
    sky: ['#426a83', '#aeb5ad', '#d5bc94'],
    terrain: [0.72, 0.55, 0.33],
    rock: [0.45, 0.34, 0.25],
    texture: 'terrain-sand',
    rockiness: 0.45,
    textureScale: 480,
    hazeDistance: 27000,
    stars: 0,
    light: 1,
  }),
  rocky: style({
    label: 'Sziklás hegyvidék',
    sky: ['#304c6c', '#93a8b4', '#bfc7c6'],
    terrain: [0.44, 0.43, 0.39],
    rock: [0.32, 0.33, 0.34],
    texture: 'terrain-rock',
    rockiness: 1,
    snow: 0.85,
    snowLine: 1250,
    snowRange: 650,
    textureScale: 550,
    stars: 0,
    light: 0.94,
  }),
  sunset: style({
    label: 'Naplemente',
    sky: ['#242c54', '#bd776b', '#e7b282'],
    terrain: [0.4, 0.34, 0.22],
    rock: [0.39, 0.3, 0.28],
    stars: 0.14,
    light: 0.76,
    sun: true,
    hazeDistance: 32000,
  }),
  night: style({
    label: 'Csillagos éjszaka',
    sky: ['#020510', '#101a30', '#252d3b'],
    terrain: [0.19, 0.22, 0.28],
    rock: [0.24, 0.26, 0.31],
    stars: 1,
    light: 0.5,
    hazeDistance: 28000,
  }),
  winter: style({
    label: 'Tél · borús, havas táj',
    sky: ['#535e6d', '#9ca6af', '#d1d5d7'],
    terrain: [0.86, 0.89, 0.91],
    rock: [0.34, 0.37, 0.4],
    texture: 'terrain-snow',
    rockiness: 0.9,
    snow: 1,
    snowLine: -200,
    snowRange: 250,
    textureScale: 430,
    clouds: true,
    stars: 0,
    light: 0.86,
    hazeDistance: 26000,
  }),
};
export const surfaceStyle = (id) => surfaceStyles[id] || surfaceStyles.vector;
export const materialIds = { aircraft: 1, camo: 2, concrete: 3, hangar: 4, terrain: 5, asphalt: 6 };
export function materialFor(kind) {
  return kind === 'air'
    ? 'aircraft'
    : ['truck', 'convoy', 'sam', 'sam-system', 'jammer', 'target-range', 'ballistic-silo'].includes(
          kind,
        )
      ? 'camo'
      : 'concrete';
}
export { materialPixels } from './rendering/shared/materialPixels.js';
export { SurfaceTextures } from './rendering/webgl/textures.js';

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Shared slope/altitude palette for the CPU fallback; the GPU uses the same blend.
export function terrainTint(id, normalY, height, light = 1) {
  const p = surfaceStyle(id),
    slope = 1 - Math.abs(normalY),
    rock = smooth(0.12, 0.58, slope) * p.rockiness;
  const snow =
    p.snow * smooth(p.snowLine, p.snowLine + p.snowRange, height) * (1 - smooth(0.25, 0.68, slope));
  return p.terrain.map((v, i) => {
    const stone = v * (1 - rock) + p.rock[i] * rock;
    return (stone * (1 - snow) + [0.89, 0.92, 0.95][i] * snow) * (0.48 + 0.52 * light) * p.light;
  });
}

export function missionSurface(mission) {
  if (mission.naval) return 'ocean';
  return missionLocation(mission)?.surface || 'grass';
}
