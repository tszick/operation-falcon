import { aircraftFlightSpec } from './aiAircraftSpec.js';
import { Vec3, Quat, DEG, clamp, forward, right } from './math.js';
import { createAircraft } from './physics.js';
import { terrainHeight } from './terrain.js';
import { weaponProfiles } from './weaponDynamics.js';
import { explosionEffect } from './effects.js';
import { aircraftMesh } from './airframes.js';

const vec = (value) => new Vec3(value?.x || 0, value?.y || 0, value?.z || 0);
const lerp = (a, b, t) => a + (b - a) * t;
function vectorBetween(a, b, t) {
  return vec(a)
    .scale(1 - t)
    .add(vec(b || a).scale(t));
}
export function replayRotation(a = {}, b = a, t = 0) {
  const qa = new Quat(a.x || 0, a.y || 0, a.z || 0, a.w ?? 1).normalize(),
    qb = new Quat(b.x || 0, b.y || 0, b.z || 0, b.w ?? 1).normalize();
  let dot = qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w;
  if (dot < 0) {
    qb.x *= -1;
    qb.y *= -1;
    qb.z *= -1;
    qb.w *= -1;
    dot *= -1;
  }
  const angle = Math.acos(clamp(dot, -1, 1)),
    sine = Math.sin(angle),
    x = sine > 0.001 ? Math.sin((1 - t) * angle) / sine : 1 - t,
    y = sine > 0.001 ? Math.sin(t * angle) / sine : t;
  return new Quat(
    qa.x * x + qb.x * y,
    qa.y * x + qb.y * y,
    qa.z * x + qb.z * y,
    qa.w * x + qb.w * y,
  ).normalize();
}
export function replayBracket(entries, time) {
  if (!entries.length) return null;
  let low = 0,
    high = entries.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (entries[mid].t <= time) low = mid;
    else high = mid - 1;
  }
  const a = entries[low],
    b = entries[Math.min(low + 1, entries.length - 1)];
  return {
    a,
    b,
    index: low,
    mix: a === b ? 0 : clamp((time - a.t) / Math.max(0.0001, b.t - a.t), 0, 1),
  };
}
export function selectHighlights(log, limit = 6) {
  const entries = log?.entries || [],
    samples = entries.filter((e) => e.kind === 'sample' && e.data.player?.position);
  if (!samples.length) return [];
  const start = samples[0].t,
    end = samples.at(-1).t,
    candidates = [];
  if (end - start < 10) return [];
  const duration = Math.min(15, end - start);
  const add = (time, label, priority, before = 8, focusId = null) => {
    // Shift the full window at mission boundaries instead of truncating the clip.
    const from = clamp(time - before, start, end - duration);
    candidates.push({
      start: from,
      end: from + duration,
      label,
      priority,
      focusId,
      eventTime: time,
    });
  };
  for (let i = 1; i < samples.length; i++)
    if (samples[i - 1].data.player.onGround && !samples[i].data.player.onGround)
      add(samples[i].t, 'FELSZÁLLÁS', 95, 4);
  for (const event of entries) {
    if (event.kind === 'touchdown') add(event.t, 'LESZÁLLÁS', 100, 10);
    if (event.kind !== 'combat') continue;
    const data = event.data || {};
    if (data.sourceId !== 'PLAYER' && data.targetId !== 'PLAYER') continue;
    if (
      ['target-destroyed', 'target-hit', 'missile-launch', 'gun', 'damage-hit'].includes(data.type)
    )
      add(
        event.t,
        'HARCI JELENET',
        data.type === 'target-destroyed' || data.destroyed
          ? 90
          : data.type === 'target-hit'
            ? 85
            : 70,
        8,
        data.sourceId === 'PLAYER' ? data.targetId : data.sourceId,
      );
    if (['bomb-release', 'practice-bomb-impact'].includes(data.type))
      add(event.t, 'FÖLDI CSAPÁS', 80);
  }
  if (!candidates.length) {
    const best = samples.reduce(
      (best, sample) =>
        Math.abs(sample.data.player.bankDeg || 0) > Math.abs(best.data.player.bankDeg || 0)
          ? sample
          : best,
      samples[Math.floor(samples.length / 2)],
    );
    add(best.t, 'REPÜLÉS RÉSZLETE', 1);
  }
  const selected = [];
  const ordered = candidates.sort((a, b) => b.priority - a.priority),
    variety = ordered.filter(
      (candidate, index) => ordered.findIndex((other) => other.label === candidate.label) === index,
    );
  for (const candidate of [...variety, ...ordered]) {
    if (selected.includes(candidate)) continue;
    if (
      selected.some(
        (clip) =>
          Math.min(clip.end, candidate.end) - Math.max(clip.start, candidate.start) >
          Math.min(clip.end - clip.start, candidate.end - candidate.start) * 0.6,
      )
    )
      continue;
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected.sort((a, b) => a.start - b.start);
}

export class FlightReplay {
  constructor(log) {
    this.log = log;
    this.samples = (log.entries || [])
      .filter((e) => e.kind === 'sample' && e.data.player?.position)
      .sort((a, b) => a.t - b.t);
    this.worlds = (log.entries || [])
      .filter((e) => e.kind === 'world')
      .map((e) => ({ ...e, units: new Map(e.data.units.map((unit) => [unit.id, unit])) }))
      .sort((a, b) => a.t - b.t);
    this.initialUnits = new Map((log.metadata?.initialUnits || []).map((unit) => [unit.id, unit]));
    this.base = createAircraft(log.metadata.aircraft);
    this.clips = selectHighlights(log);
    this.explosions = (log.entries || [])
      .filter((e) => e.kind === 'combat' && e.data.type === 'explosion' && e.data.position)
      .map((e) => ({
        t: e.t,
        effect: explosionEffect(vec(e.data.position), {
          heavy: e.data.heavy,
          ground: e.data.ground,
          seed: e.seq ?? Math.round(e.t * 1000),
        }),
      }));
    this.projectiles = new Map();
    for (const entry of log.entries || []) {
      if (entry.kind === 'projectile-start')
        this.projectiles.set(entry.data.id, {
          start: entry.t,
          end: Infinity,
          frames: [{ t: entry.t, data: { ...entry.data, age: entry.data.age || 0 } }],
        });
      if (entry.kind === 'projectile-end' && this.projectiles.has(entry.data.id))
        this.projectiles.get(entry.data.id).end = entry.t;
      if (entry.kind === 'world')
        for (const projectile of entry.data.projectiles || []) {
          let track = this.projectiles.get(projectile.id);
          if (!track) {
            track = { start: entry.t, end: Infinity, frames: [] };
            this.projectiles.set(projectile.id, track);
          }
          track.frames.push({ t: entry.t, data: projectile });
        }
    }
    this.projectileStarts = [...this.projectiles.values()].sort((a, b) => a.start - b.start);
    this.activeProjectiles = new Set();
    this.nextProjectile = 0;
    this.previousTime = -Infinity;
  }
  frame(time) {
    const bracket = replayBracket(this.samples, time);
    if (!bracket) return null;
    const { a, b, mix } = bracket,
      p = a.data.player,
      next = b.data.player;
    const state = {
      ...this.base,
      ...p,
      spec: this.log.metadata.aircraft,
      position: vectorBetween(p.position, next.position, mix),
      velocity: vectorBetween(p.velocity, next.velocity, mix),
      orientation: replayRotation(p.orientation, next.orientation, mix),
      elapsed: time,
      ias: lerp(p.iasKmh || 0, next.iasKmh || 0, mix) / 3.6,
      speed: (p.tasKmh || 0) / 3.6,
      agl: lerp(p.aglM || 0, next.aglM || 0, mix),
      landingRouteEnabled: false,
      rearView: false,
      headLook: null,
      condition: {
        ...this.base.condition,
        parts: { ...this.base.condition.parts, ...p.parts },
        engines: p.engines || [],
        smoke: [],
      },
    };
    const world = replayBracket(this.worlds, time),
      units = world?.a.units || this.initialUnits,
      laterUnits = world?.b.units || units,
      u = world?.mix || 0;
    const targets = [...units.values()].map((unit) => {
      const later = laterUnits.get(unit.id) || unit,
        position = vectorBetween(unit.position, later.position, u),
        orientation = replayRotation(
          unit.flight?.orientation ||
            Quat.euler(
              (unit.headingDeg || 0) * DEG,
              (unit.pitchDeg || 0) * DEG,
              (unit.bankDeg || 0) * DEG,
            ),
          later.flight?.orientation ||
            Quat.euler(
              (later.headingDeg || 0) * DEG,
              (later.pitchDeg || 0) * DEG,
              (later.bankDeg || 0) * DEG,
            ),
          u,
        );
      return {
        ...unit,
        position,
        velocity: vectorBetween(unit.velocity, later.velocity, u),
        heading: (unit.headingDeg || 0) * DEG,
        pitch: (unit.pitchDeg || 0) * DEG,
        bank: (unit.bankDeg || 0) * DEG,
        flight:
          unit.kind === 'air'
            ? {
                ...unit.flight,
                spec: aircraftFlightSpec(
                  unit.aircraftId ||
                    (typeof unit.flight?.spec === 'string'
                      ? unit.flight.spec
                      : unit.flight?.spec?.id) ||
                    'mig29',
                ),
                position,
                velocity: vectorBetween(unit.velocity, later.velocity, u),
                orientation,
                damage: unit.damage || 0,
                elapsed: time,
                condition: {
                  parts: unit.flight?.parts || {},
                  engines: unit.flight?.engines || [],
                  smoke: [],
                },
              }
            : null,
      };
    });
    const projectiles = [];
    if (time < this.previousTime) {
      this.activeProjectiles.clear();
      this.nextProjectile = 0;
    }
    this.previousTime = time;
    while (
      this.nextProjectile < this.projectileStarts.length &&
      this.projectileStarts[this.nextProjectile].start <= time
    )
      this.activeProjectiles.add(this.projectileStarts[this.nextProjectile++]);
    for (const track of this.activeProjectiles) {
      if (time >= track.end) {
        this.activeProjectiles.delete(track);
        continue;
      }
      const frame = replayBracket(track.frames, time),
        data = { ...track.frames[0].data, ...frame.a.data };
      const position =
        frame.a === frame.b
          ? vec(data.position).add(vec(data.velocity).scale(Math.min(0.5, time - frame.a.t)))
          : vectorBetween(data.position, frame.b.data.position, frame.mix);
      projectiles.push({
        ...data,
        position,
        velocity: vec(data.velocity),
        age: (data.age || 0) + time - frame.a.t,
        profile: weaponProfiles[data.profile] || { burn: 6 },
      });
    }
    const decoys = (world?.a.data.decoys || []).map((d) => ({
      ...d,
      position: vec(d.position).add(vec(d.velocity).scale(time - world.a.t)),
      life: d.type === 'flare' ? 4 : 6,
    }));
    state.countermeasures = { ...state.countermeasures, decoys };
    const effects = [];
    const recent = replayBracket(this.explosions, time);
    if (recent)
      for (let index = recent.index; index >= 0; index--) {
        const event = this.explosions[index],
          age = time - event.t;
        if (age > 5) break;
        if (age >= 0 && age < event.effect.maxLife)
          effects.push({ ...event.effect, age, life: event.effect.maxLife - age });
      }
    return {
      state,
      targets,
      weapons: { selected: 'gun', projectiles, effects, trails: [] },
      aim: { id: null, locked: false },
    };
  }
}

export function highlightCamera(state, focus = null) {
  // Long-range combat is filmed beside its recorded aircraft target, not kilometres away
  // behind the player. The same subject stays in focus throughout the 15-second clip.
  if (focus?.kind === 'air' && focus.flight) state = focus.flight;
  const heading = forward(state.orientation);
  heading.y = 0;
  heading.normalize();
  const side = right(Quat.euler(Math.atan2(heading.x, heading.z), 0, 0));
  const distance = Math.max(65, (aircraftMesh(state.spec.id).radius || 15) * 3.8);
  const position = state.position
    .clone()
    .add(heading.clone().scale(-distance))
    .add(side.clone().scale(distance * 0.7))
    .add(new Vec3(0, distance * 0.32, 0));
  position.y = Math.max(position.y, terrainHeight(position.x, position.z) + 6);
  const look = state.position
    .clone()
    .sub(side.scale(distance * 0.25))
    .add(new Vec3(0, 3, 0))
    .sub(position);
  return {
    position,
    orientation: Quat.euler(
      Math.atan2(look.x, look.z),
      Math.atan2(look.y, Math.hypot(look.x, look.z)),
      0,
    ),
  };
}
