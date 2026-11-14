import { weaponProfiles } from '../weaponDynamics.js';
import { Vec3 } from '../math.js';
import { explosionEffect, impactEffect } from '../effects.js';
import { unpackProjectile, unpackTarget } from './combatState.js';
import { interpolateOrientation } from './flightState.js';
const vector = (v) => new Vec3(v.x, v.y, v.z);
const lerp = (a, b, t) =>
  new Vec3(a.x * (1 - t) + b.x * t, a.y * (1 - t) + b.y * t, a.z * (1 - t) + b.z * t);
export class NetworkCombatView {
  constructor() {
    this.frames = [];
    this.decoded = new WeakMap();
    this.projectileIndex = new WeakMap();
    this.cursor = 0;
    this.effects = [];
    this.trails = [];
  }
  accept(snapshot, initial = false) {
    if (!snapshot.combat || (this.frames.length && snapshot.tick < this.frames.at(-1).tick)) return;
    const old = this.frames.at(-1),
      previous = old && this.projectileIndex.get(old);
    if (old?.tick === snapshot.tick) this.frames.pop();
    this.decoded.set(
      snapshot,
      new Map(snapshot.combat.targets.map((t) => [t.id, unpackTarget(t)])),
    );
    this.projectileIndex.set(snapshot, new Map(snapshot.combat.projectiles.map((p) => [p.id, p])));
    this.frames.push(snapshot);
    if (this.frames.length > 8) this.frames.shift();
    if (initial) {
      this.cursor = 0;
      this.effects = [];
      this.trails = [];
    }
    for (const p of snapshot.combat.projectiles) {
      const before = previous?.get(p.id);
      if (before && ['aam', 'agm'].includes(p.type) && p.age < weaponProfiles[p.profile].burn) {
        this.trails.push({
          from: vector(before.position),
          to: vector(p.position),
          velocity: vector(p.velocity).normalize(),
          time: snapshot.time,
          maxLife: 3.5,
        });
      }
    }
    if (this.trails.length > 500) this.trails.splice(0, this.trails.length - 500);
    for (const event of snapshot.combat.events) {
      if (event.id <= this.cursor) continue;
      this.cursor = event.id;
      const position = event.position && vector(event.position);
      let effect;
      if (event.type === 'explosion')
        effect = explosionEffect(position, {
          ground: event.ground,
          heavy: event.heavy,
          seed: event.id,
        });
      else if (
        event.type === 'impact' ||
        (event.type === 'target-hit' && event.weapon === 'gun' && !event.destroyed)
      )
        effect = impactEffect(position);
      else if (event.type === 'gun')
        effect = { kind: 'muzzle', position, fixedPosition: position, maxLife: 0.055 };
      if (effect) this.effects.push({ ...effect, time: event.time });
    }
    this.cursor = Math.max(this.cursor, snapshot.combat.eventSequence);
    // A bounded event history is repeated on the wire; each event becomes one visual only.
    this.effects = this.effects.filter((e) => snapshot.time - e.time < e.maxLife + 0.3).slice(-128);
    this.trails = this.trails.filter((e) => snapshot.time - e.time < e.maxLife + 0.3);
  }
  sample(time) {
    let a = this.frames[0],
      b = a;
    if (!a) return { projectiles: [], targets: [], effects: [], trails: [] };
    for (const frame of this.frames) {
      b = frame;
      if (frame.time >= time) break;
      a = frame;
    }
    const t = Math.max(0, Math.min(1, (time - a.time) / Math.max(0.0001, b.time - a.time)));
    const next = this.projectileIndex.get(b),
      previous = this.projectileIndex.get(a);
    const projectiles = [];
    for (const p of a.combat.projectiles) {
      const q = next.get(p.id),
        out = unpackProjectile(q || p, q ? p : null, t);
      if (q || t < 1 || a === b) projectiles.push(out);
    }
    if (t >= 1)
      for (const p of next.values()) if (!previous.has(p.id)) projectiles.push(unpackProjectile(p));
    const previousTargets = this.decoded.get(a),
      currentTargets = this.decoded.get(b);
    const targets = [...currentTargets.values()].map((q) => {
      const p = previousTargets.get(q.id) || q;
      const out = { ...(t < 1 ? p : q) };
      if (out.flight) {
        out.flight = { ...out.flight };
        out.defense = out.flight;
      }
      out.position = lerp(p.position, q.position, t);
      if (p.flight && q.flight) {
        out.flight.position = out.position;
        out.flight.orientation = interpolateOrientation(
          p.flight.orientation,
          q.flight.orientation,
          t,
        );
      }
      return out;
    });
    const visible = (list) =>
      list
        .filter((e) => time >= e.time && time - e.time < e.maxLife)
        .map((e) => ({ ...e, age: time - e.time, life: e.maxLife - (time - e.time) }));
    return { projectiles, targets, effects: visible(this.effects), trails: visible(this.trails) };
  }
}
