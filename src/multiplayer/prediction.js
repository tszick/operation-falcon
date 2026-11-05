import { applyFlightCommand, unpackFlight, interpolateFlight } from './flightState.js';
import { NETWORK_STEP } from './protocol.js';
export class FlightPrediction {
  constructor() {
    this.pending = [];
    this.outgoing = [];
    this.sequence = 0;
    this.state = null;
    this.simulating = true;
  }
  reset(player) {
    this.pending = [];
    this.outgoing = [];
    this.sequence = player.ack;
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
    this.pending = this.pending.filter((c) => c.seq > player.ack);
    this.state = unpackFlight(player.state);
    if (this.simulating)
      for (const command of this.pending) applyFlightCommand(this.state, command, NETWORK_STEP);
  }
}
export class SnapshotBuffer {
  constructor() {
    this.frames = [];
  }
  add(snapshot) {
    if (this.frames.length && snapshot.tick <= this.frames.at(-1).tick) return false;
    this.frames.push(snapshot);
    if (this.frames.length > 32) this.frames.shift();
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
    const pa = a.players.find((p) => p.id === id),
      pb = b.players.find((p) => p.id === id);
    if (!pb) return null;
    if (!pa) return unpackFlight(pb.state);
    return interpolateFlight(
      { time: a.time, state: pa.state },
      { time: b.time, state: pb.state },
      time,
    );
  }
}
