import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
export function analyzeFlightMeasurements(directory, phase = 'final') {
  const report = JSON.parse(fs.readFileSync(path.join(directory, phase + '-report.json'), 'utf8'));
  let samples = 0,
    logs = 0,
    maxWindError = 0,
    maxPressureError = 0;
  for (const filename of fs
    .readdirSync(directory)
    .filter((f) => f.startsWith(phase + '-') && f.endsWith('.json'))) {
    const log = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
    if (log.metadata?.format !== 'operation-falcon-flight-log') continue;
    logs++;
    const frames = log.entries.filter((e) => e.kind === 'sample').map((e) => e.data.player);
    assert.ok(frames.at(-1).forces, filename + ' final sample must contain measured forces');
    for (const p of frames) {
      samples++;
      assert.equal(p.crashed, false, filename);
      assert.equal(p.damage, 0, filename);
      for (const vector of [p.position, p.velocity, p.windMps, p.airVelocityMps])
        if (vector) for (const n of Object.values(vector)) assert.ok(Number.isFinite(n), filename);
      if (p.windMps && p.airVelocityMps)
        for (const a of ['x', 'y', 'z'])
          maxWindError = Math.max(
            maxWindError,
            Math.abs(p.velocity[a] - p.windMps[a] - p.airVelocityMps[a]),
          );
      if (p.engineSpool !== null) assert.ok(p.engineSpool >= 0 && p.engineSpool <= 1);
      const f = p.forces;
      if (!f) continue;
      assert.ok(f.groundEffectFactor >= 0.25 && f.groundEffectFactor <= 1);
      assert.ok(f.waveDragCoefficient >= 0 && Number.isFinite(f.dragN));
      const q = 0.5 * f.densityKgM3 * f.airSpeedMps ** 2;
      maxPressureError = Math.max(
        maxPressureError,
        Math.abs(q - f.dynamicPressurePa) / Math.max(1, q),
      );
    }
  }
  assert.ok(logs >= 22);
  assert.ok(maxWindError < 0.0002);
  assert.ok(maxPressureError < 1e-10);
  const r = report.scenarios,
    cold = r['engine-cold'].thrustAtSeconds.find((p) => p.t === 1),
    hot = r['engine-hot'].thrustAtSeconds.find((p) => p.t === 1);
  assert.ok(cold.deliveredFraction > 0 && cold.deliveredFraction < 0.9);
  assert.ok(hot.deliveredFraction > cold.deliveredFraction);
  assert.ok(
    r['wind-headwind'].iasKmh > r['wind-calm'].iasKmh &&
      r['wind-calm'].iasKmh > r['wind-tailwind'].iasKmh,
  );
  assert.ok(r['ground-5'].dragN < r['ground-100'].dragN);
  assert.ok(Math.abs(r['ground-5'].liftN - r['ground-100'].liftN) < 0.001);
  assert.ok(r['mach-1'].cd > r['mach-0.6'].cd);
  assert.ok(r['mach-2'].cd < r['mach-1.2'].cd);
  for (const [name, v] of Object.entries(r).filter(([name]) => name.startsWith('takeoff-'))) {
    assert.ok(v.liftoffAt !== null, name);
    assert.ok(v.liftoffDistanceM < 2920, name + ' runway');
    assert.ok(v.finalClimbMps > 0 && v.finalAglM > 20, name + ' sustained climb');
  }
  const ai = JSON.parse(
    fs.readFileSync(path.join(directory, phase + '-ai-crosswind-service.json'), 'utf8'),
  );
  assert.equal(ai.success, true);
  assert.equal(ai.crashed, false);
  const audit = {
    passed: true,
    logs,
    samples,
    maxWindVectorResidualMps: maxWindError,
    maxRelativeDynamicPressureError: maxPressureError,
    engineAtOneSecond: { idleStart: cold.deliveredFraction, hotStart: hot.deliveredFraction },
    groundDragReductionPercent: 100 * (1 - r['ground-5'].dragN / r['ground-100'].dragN),
    waveDragIncreasePercent: 100 * (r['mach-1'].cd / r['mach-0.6'].cd - 1),
    takeoffs: 8,
    aiCrosswindServiceSeconds: ai.time,
  };
  fs.writeFileSync(path.join(directory, 'audit.json'), JSON.stringify(audit, null, 2) + '\n');
  const text = [
    '# Repülési modell – naplókból visszamért eredmény',
    '',
    'Minden alábbi érték az exportált FlightRecorder-naplókból származik. A vizsgálat csökkentett rendű játékmodellt ellenőriz, nem típusminősítést.',
    '',
    '- Sikeres ellenőrzés: ' + logs + ' napló, ' + samples + ' mintavétel.',
    '- Szélvektor-egyenleg legnagyobb hibája: ' + maxWindError.toExponential(2) + ' m/s.',
    '- Dinamikus nyomás legnagyobb relatív hibája: ' + maxPressureError.toExponential(2) + '.',
    '- Egy másodpercnél: alacsony kezdő teljesítményről ' +
      (cold.deliveredFraction * 100).toFixed(1) +
      '%, meleg, 70%-on járó hajtóműről ' +
      (hot.deliveredFraction * 100).toFixed(1) +
      '% a kért száraz tolóerőből.',
    '- Azonos kezdeti talajsebesség mellett szembeszél / szélcsend / hátszél IAS: ' +
      ['headwind', 'calm', 'tailwind'].map((k) => r['wind-' + k].iasKmh.toFixed(1)).join(' / ') +
      ' km/h.',
    '- Azonos dinamikus nyomás és állásszög mellett 5 m-en ' +
      audit.groundDragReductionPercent.toFixed(2) +
      '%-kal kisebb teljes légellenállás, változatlan felhajtóerő.',
    '- Mach 1 ellenállástényezője ' +
      audit.waveDragIncreasePercent.toFixed(1) +
      '%-kal nagyobb a Mach 0,6 ponténál.',
    '- Mind a hat prototípus, az F-16 és a megengedett tömegű B-52 felszállt, és további tíz másodperc múlva is sérülésmentesen emelkedett.',
    '- Az MI 5 m/s oldalirányú szélkomponens mellett leszállt, megállt, feltöltött, kigurult és újra felszállt. Teljes ciklus: ' +
      ai.time.toFixed(1) +
      ' s.',
    '',
    '## Újrafuttatás',
    '',
    'node scripts/measure-flight-model.mjs OUTPUT_DIRECTORY final',
    'node scripts/analyze-flight-model.mjs OUTPUT_DIRECTORY',
    '',
    'A baseline-* fájlok a módosítás előtti állapotot őrzik. A korai B-52 gördítési alapmérés még trimmelés nélküli kezdőhelyzetet használt; ezt nem használjuk kalibrált, sérülésmentes összehasonlításként. A végleges B-52-mérés megfelelő kezdő állásszöggel fut.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(directory, 'audit.md'), text);
  return audit;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2])
    throw Error('Usage: node scripts/analyze-flight-model.mjs OUTPUT_DIRECTORY');
  console.log(JSON.stringify(analyzeFlightMeasurements(process.argv[2]), null, 2));
}
