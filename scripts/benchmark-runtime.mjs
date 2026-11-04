// Repeatable CPU-stage benchmarks; these do not claim to measure display/GPU FPS.
import { configureTerrain, terrainWorld } from '../src/terrain.js';
import { terrainSnapshot } from '../src/terrainSurface.js';
import { prepareTerrain } from '../src/terrainPreparation.js';
import * as colors from '../src/rendering/shared/shapes.js';
import { aircraft, missions } from '../src/aircraftSpec.js';
import { createTargets, Targeting } from '../src/targeting.js';
import { createMissionAircraft } from '../src/missionStart.js';
import { Mission } from '../src/mission.js';
import { Weapons } from '../src/weapons.js';
import { FlightRecorder } from '../src/flightRecorder.js';
const summary = (values) => {
  const a = values.toSorted((a, b) => a - b);
  return {
    medianMs: +a[Math.floor(a.length * 0.5)].toFixed(3),
    p95Ms: +a[Math.floor(a.length * 0.95)].toFixed(3),
  };
};
const results = {};
configureTerrain({ id: 'convoy' }, undefined, () => 0.3);
terrainWorld.skySeed = 417;
const world = structuredClone(terrainSnapshot()),
  times = [];
for (let i = 0; i < 24; i++) {
  const start = performance.now();
  const data = prepareTerrain({
    key: 'bench:' + i,
    revision: world.revision,
    world,
    cx: -4500 + (i % 8) * 450,
    cz: 6000,
    patches: [],
    wire: false,
  });
  if (!data.fills.length) throw Error('No terrain');
  if (i >= 8) times.push(performance.now() - start);
}
results.forestTerrainRebuild = summary(times);
const palette = [
  '#baf37d',
  '#64d7ff',
  '#ff9875',
  '#101c16',
  'rgba(18,30,20,0.8)',
  'rgb(180,200,160)',
  'hsl(80 60% 55%)',
];
const parse = colors.cachedRgba || colors.rgba,
  colorTimes = [];
let checksum = 0;
for (let j = 0; j < 8; j++) {
  const start = performance.now();
  for (let i = 0; i < 200000; i++) checksum += parse(palette[i % palette.length])[0];
  if (j >= 2) colorTimes.push(performance.now() - start);
}
results.repeatedPaintColors = summary(colorTimes);
const spec = aircraft.find((a) => a.id === 'f14'),
  scenario = missions.find((m) => m.id === 'carrier-defense'),
  logTimes = [];
for (let j = 0; j < 8; j++) {
  const targets = createTargets(scenario, spec, { rng: () => 0.3 }),
    s = createMissionAircraft(spec, scenario),
    w = new Weapons(),
    aim = new Targeting(),
    m = new Mission(scenario),
    rec = new FlightRecorder();
  m.update(s, targets, w, aim);
  rec.start(s, m, targets, w, aim);
  const start = performance.now();
  for (let i = 1; i <= 1200; i++) {
    s.elapsed = i / 120;
    rec.capture(s, m, targets, w, aim, {});
  }
  if (j >= 2) logTimes.push(performance.now() - start);
}
results.carrierLogTenSeconds = summary(logTimes);
console.log(JSON.stringify({ node: process.version, results, checksum }, null, 2));
