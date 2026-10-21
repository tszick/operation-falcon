// The Western scripted operation cannot wait for a human service stop when AI flies it.
// This opposing timeline activates the same stored units, without adding extra waves.
export function updateMirroredRuntime(s, m, targets, w) {
  if (m.spec.objective !== 'iron-veil') return;
  for (const [wave, time] of [
    ['escort', 180],
    ['intercept', 300],
    ['counterstrike', 540],
    ['counter-cover', 540],
  ]) {
    if (s.elapsed < time) continue;
    for (const t of targets.filter((t) => t.operationWave === wave && t.pending)) {
      t.pending = false;
      t.alive = true;
      w.emit?.({ type: 'operation-wave', stage: wave, sourceId: t.id, time: s.elapsed });
    }
  }
  const strike = targets.find((t) => t.id === 'WESTERN-LEAD');
  if (strike?.alive)
    strike.aiTargetId = ['IV-SAM1', 'IV-SAM2', 'IV-BRIDGE', 'IV-COMMAND'].find((id) =>
      targets.some((t) => t.id === id && t.alive),
    );
}
