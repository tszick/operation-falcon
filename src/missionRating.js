import { evaluateFlight } from './flightDebrief.js';

// A mission must succeed before flight quality can earn any stars.
export function missionRating(log, analysis = evaluateFlight(log)) {
  const entries = log?.entries || [],
    samples = entries.filter((e) => e.kind === 'sample'),
    result = analysis.result,
    successful = result?.result === 'success',
    objectives = Array.isArray(analysis.objectives)
      ? analysis.objectives
      : typeof analysis.objectives?.complete === 'boolean'
        ? [{ id: 'primary', done: analysis.objectives.complete }]
        : [],
    required = objectives.filter((objective) => !objective.optional),
    duration = log?.metadata?.durationSeconds ?? entries.at(-1)?.t ?? 0;
  const common = {
    successful,
    duration,
    completed: required.filter((o) => o.done).length,
    total: required.length,
    score: result?.score || 0,
  };
  if (!successful || !samples.length)
    return {
      ...common,
      stars: 0,
      percent: 0,
      label: successful
        ? 'Nincs elegendő adat az értékeléshez'
        : result
          ? 'Sikertelen küldetés'
          : 'Még nincs lezárva',
      deductions: [],
    };
  const deductions = [];
  // Mission completion contributes 60%; these deductions affect the remaining 40%.
  const deduct = (reason, points, severe = false) =>
    deductions.push({ reason, points: Math.round(points * 0.4), severe });
  const touchdown = entries.findLast((e) => e.kind === 'touchdown')?.data;
  if (touchdown?.grade === 'severe') deduct('Súlyos földetérés', 35, true);
  else if (touchdown?.grade && touchdown.grade !== 'smooth') deduct('Kemény földetérés', 15);
  const initialDamage = samples[0]?.data.player?.damage || 0,
    damage =
      samples.reduce((max, e) => Math.max(max, e.data.player?.damage || 0), initialDamage) -
      initialDamage -
      entries
        .filter((e) => e.kind === 'touchdown' && e.data.success)
        .reduce((sum, e) => sum + (e.data.impactDamage || 0), 0);
  if (damage >= 30)
    deduct(
      'Jelentős szerkezeti sérülés',
      Math.max(35, Math.min(45, Math.round(damage * 0.6))),
      true,
    );
  else if (damage >= 1) deduct('Szerkezeti sérülés', Math.max(3, Math.round(damage * 0.6)));
  const warnings = analysis.phases.filter(
    (phase) => (phase.procedureFindings || phase.findings).length > 0,
  );
  if (warnings.length)
    deduct(
      'Repülési eljárások eltérései',
      Math.min(25, new Set(warnings.map((phase) => phase.id)).size * 5),
    );
  const friendlies = new Set(
    (log.metadata?.initialUnits || [])
      .filter((unit) => unit.team === 'ally')
      .map((unit) => unit.id),
  );
  const alliedKills = new Set(
    entries
      .filter(
        (e) =>
          e.kind === 'combat' &&
          e.data.type === 'target-hit' &&
          e.data.sourceId === 'PLAYER' &&
          e.data.destroyed &&
          friendlies.has(e.data.targetId),
      )
      .map((e) => e.data.targetId),
  ).size;
  if (alliedKills)
    deduct('Baráti egység elvesztése saját tűzben', Math.min(60, alliedKills * 35), true);
  const optional = objectives.filter((objective) => objective.optional && !objective.done);
  if (optional.length)
    deduct('Kiegészítő célok nem teljesültek', Math.min(20, optional.length * 10));
  const severe = deductions.some((deduction) => deduction.severe);
  // A completed mission cannot be rated as almost entirely unfulfilled.
  let remaining = 40;
  for (const deduction of deductions) {
    deduction.points = Math.min(remaining, deduction.points);
    remaining -= deduction.points;
  }
  const percent = 60 + remaining;
  const stars = severe || remaining < 28 ? 1 : deductions.length ? 2 : 3;
  return {
    ...common,
    percent,
    stars,
    deductions,
    label: [
      'Sikertelen küldetés',
      'Súlyos hibák, sikeres küldetés',
      'Kisebb hibák',
      'Tökéletes teljesítés',
    ][stars],
  };
}
