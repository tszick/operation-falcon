import { targetTypeLabel } from './targetPresentation.js';
import { clamp } from './math.js';
const isPlayer = (id) => typeof id === 'string' && id.toUpperCase() === 'PLAYER';
// Outcomes drive the film. Launches and bursts are only fallbacks when the log
// contains no recorded hit; one engagement must not occupy several clip slots.
export function selectHighlights(log, limit = 6) {
  if (limit <= 0) return [];
  const entries = [...(log?.entries || [])].sort((a, b) => a.t - b.t),
    samples = entries.filter((e) => e.kind === 'sample' && e.data.player?.position);
  if (!samples.length) return [];
  const start = samples[0].t,
    end = samples.at(-1).t;
  if (end - start < 10) return [];
  const candidates = [],
    outcomes = [],
    launches = new Map(),
    units = new Map((log.metadata?.initialUnits || []).map((u) => [u.id, u]));
  for (const e of entries) {
    if (e.kind === 'unit-state' && e.data.id) units.set(e.data.id, e.data);
    if (
      e.kind === 'combat' &&
      ['missile-launch', 'bomb-release'].includes(e.data.type) &&
      e.data.projectileId != null
    )
      launches.set(e.data.projectileId, e);
  }
  const add = (time, label, priority, before = 8, focusId = null, details = {}) => {
    const launch = details.launchTime,
      from = launch != null && time - launch <= 42 ? launch - 2 : time - before,
      duration = Math.min(end - start, Math.max(15, time - from + 4)),
      clipStart = clamp(from, start, end - duration);
    const clip = {
      start: clipStart,
      end: clipStart + duration,
      label,
      priority,
      focusId,
      eventTime: time,
      ...details,
    };
    candidates.push(clip);
    return clip;
  };
  let lastTakeoff = -Infinity;
  for (let i = 1; i < samples.length; i++)
    if (
      samples[i - 1].data.player.onGround &&
      !samples[i].data.player.onGround &&
      samples[i].t - lastTakeoff > 30
    ) {
      add(samples[i].t, 'FELSZÁLLÁS', 110, 4, null, { kind: 'takeoff' });
      lastTakeoff = samples[i].t;
    }
  for (const event of entries) {
    if (event.t < start || event.t > end) continue;
    const d = event.data || {};
    if (event.kind === 'touchdown') add(event.t, 'LESZÁLLÁS', 120, 10, null, { kind: 'landing' });
    if (event.kind !== 'combat') continue;
    if (d.type === 'practice-bomb-impact') {
      if (d.hit)
        outcomes.push(
          add(event.t, 'GYAKORLÓBOMBA TALÁLAT', 92, 6, d.targetId, {
            kind: 'hit',
            focusPosition: d.position,
          }),
        );
      continue;
    }
    if (!isPlayer(d.sourceId) && !isPlayer(d.targetId)) continue;
    if (!['target-destroyed', 'target-hit', 'damage-hit'].includes(d.type)) continue;
    const focusId = isPlayer(d.sourceId) ? d.targetId : d.sourceId,
      unit = units.get(focusId),
      destroyed = d.type === 'target-destroyed' || !!d.destroyed,
      launch = launches.get(d.projectileId),
      playerHit = isPlayer(d.sourceId),
      missile = ['aam', 'agm', 'missile'].includes(d.weapon),
      label = destroyed
        ? unit?.kind === 'air'
          ? 'LÉGI CÉL MEGSEMMISÍTVE'
          : 'FÖLDI CÉL MEGSEMMISÍTVE'
        : playerHit && missile
          ? 'RAKÉTATALÁLAT'
          : playerHit
            ? 'HARCI JELENET'
            : 'TALÁLATOT KAPTUNK';
    outcomes.push(
      add(event.t, label, destroyed ? 105 : playerHit ? 94 : 75, 8, focusId, {
        kind: destroyed ? 'destroy' : 'hit',
        targetLabel: unit ? targetTypeLabel(unit) : undefined,
        projectileId: d.projectileId,
        focusKind: unit?.kind,
        focusRadius: unit?.radius,
        attackPosition:
          launch?.data.position || samples.findLast((s) => s.t <= event.t)?.data.player.position,
        launchTime: launch?.t,
        focusPosition: playerHit ? d.position : undefined,
      }),
    );
  }
  // Keep the strongest result per target; rapid cannon hits and salvo impacts
  // belong to one encounter. Destroyed objectives outrank launches and misses.
  const best = new Map();
  for (const clip of outcomes) {
    const key = clip.focusId || clip.projectileId || clip.eventTime,
      previous = best.get(key);
    if (
      !previous ||
      clip.priority > previous.priority ||
      (clip.priority === previous.priority && clip.eventTime > previous.eventTime)
    )
      best.set(key, clip);
  }
  const kept = new Set(best.values());
  const outcomeSet = new Set(outcomes);
  const strong = candidates.filter((c) => !outcomeSet.has(c) || kept.has(c));
  if (!outcomes.length) {
    const attacks = entries.filter(
      (e) =>
        e.kind === 'combat' &&
        isPlayer(e.data.sourceId) &&
        ['missile-launch', 'bomb-release', 'gun'].includes(e.data.type),
    );
    const used = new Set();
    for (const e of attacks) {
      const key = e.data.targetId || e.data.type;
      if (used.has(key)) continue;
      used.add(key);
      const clip = add(
        e.t,
        e.data.type === 'bomb-release' ? 'FÖLDI CSAPÁS' : 'HARCI JELENET',
        35,
        3,
        e.data.targetId,
        { kind: 'launch', projectileId: e.data.projectileId, launchTime: e.t },
      );
      strong.push(clip);
    }
  }
  if (!strong.length) {
    const bestSample = samples.reduce(
      (a, b) =>
        Math.abs(b.data.player.bankDeg || 0) > Math.abs(a.data.player.bankDeg || 0) ? b : a,
      samples[Math.floor(samples.length / 2)],
    );
    strong.push(add(bestSample.t, 'REPÜLÉS RÉSZLETE', 1, 8, null, { kind: 'flight' }));
  }
  const selected = [];
  for (const clip of strong.sort((a, b) => b.priority - a.priority || a.eventTime - b.eventTime)) {
    if (
      selected.some(
        (c) =>
          Math.min(c.end, clip.end) - Math.max(c.start, clip.start) >
          Math.min(c.end - c.start, clip.end - clip.start) * 0.6,
      )
    )
      continue;
    selected.push(clip);
    if (selected.length >= limit) break;
  }
  return selected.sort((a, b) => a.start - b.start);
}
export function replayPlaybackSpeed(clip, time) {
  return clip.launchTime != null &&
    clip.kind !== 'launch' &&
    time > clip.launchTime + 3 &&
    time < clip.eventTime - 5
    ? 3
    : 1;
}
