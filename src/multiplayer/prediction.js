import { applyFlightCommand, unpackFlight, interpolateOrientation } from './flightState.js';
import { Vec3 } from '../math.js';
import { NETWORK_STEP } from './protocol.js';
export class FlightPrediction {
  constructor() {
    this.pending = [];
    this.outgoing = [];
    this.sequence = 0;
    this.acknowledged = 0;
    this.state = null;
    this.simulating = true;
  }
  reset(player) {
    this.pending = [];
    this.outgoing = [];
    this.sequence = this.acknowledged = player.ack;
    this.state = unpackFlight(player.state);
  }
  step(axes, toggles = [], combat) {
    if (!this.simulating || !this.state || this.pending.length >= 120) return false;
    const command = { seq: ++this.sequence, axes: { ...axes }, toggles: [...toggles] };
    if (combat) command.combat = { ...combat };
    this.pending.push(command);
    this.outgoing.push(command);
    applyFlightCommand(this.state, command, NETWORK_STEP);
    return true;
  }
  reconcile(player) {
    this.acknowledged = player.ack;
    this.pending = this.pending.filter((c) => c.seq > player.ack);
    this.state = unpackFlight(player.state);
    if (this.simulating)
      for (const command of this.pending) applyFlightCommand(this.state, command, NETWORK_STEP);
  }
}
export class SnapshotBuffer {
  constructor({ maxFrames = 32 } = {}) {
    this.maxFrames = maxFrames;
    this.frames = [];
    this.decoded = new WeakMap();
  }
  add(snapshot, excludedId = null) {
    if (this.frames.length && snapshot.tick < this.frames.at(-1).tick) return false;
    if (this.frames.at(-1)?.tick === snapshot.tick) this.frames.pop();
    const decoded = new Map();
    for (const p of snapshot.players)
      if (p.id !== excludedId) decoded.set(p.id, unpackFlight(p.state));
    this.decoded.set(snapshot, decoded);
    this.frames.push(snapshot);
    if (this.frames.length > this.maxFrames) this.frames.shift();
    return true;
  }
  sample(id, time) {
    if (!this.frames.length) return null;
    let a = this.frames[0],
      b = a;
    for (const frame of this.frames) {
      b = frame;
      if (frame.time >= time) break;
      a = frame;
    }
    const pa = this.decoded.get(a).get(id),
      pb = this.decoded.get(b).get(id);
    if (!pb) return null;
    if (!pa) return { ...pb };
    const t = Math.max(0, Math.min(1, (time - a.time) / Math.max(0.0001, b.time - a.time)));
    return {
      ...pb,
      position: new Vec3(pa.position.x, pa.position.y, pa.position.z)
        .scale(1 - t)
        .add(pb.position.clone().scale(t)),
      orientation: interpolateOrientation(pa.orientation, pb.orientation, t),
    };
  }
}
