import { radioLines } from './radioLines.js';
import { RadioDirector } from './radioDirector.js';
export class RadioComms {
  constructor() {
    this.director = new RadioDirector();
    this.buffers = new Map();
    this.failed = new Set();
    this.current = null;
    this.generation = 0;
    this.enabled = true;
    this.now = 0;
  }
  attach(ctx) {
    if (this.ctx === ctx) return;
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.gain.value = 0.68;
    this.output.connect(ctx.destination);
    // Bound decoding work at startup; replaying a line only uses cached PCM.
    const initial = new Set([
        'clearance',
        'hunt',
        'civil',
        'approach',
        'wingmanReady',
        'callsignToken',
        'wingmanTail',
      ]),
      clips = [...radioLines].sort(
        (a, b) => Number(initial.has(b.group)) - Number(initial.has(a.group)),
      );
    let index = 0;
    const load = async () => {
      while (this.ctx === ctx && index < clips.length) {
        const line = clips[index++];
        try {
          const response = await fetch(line.url);
          if (!response.ok) throw new Error('Radio clip ' + response.status);
          const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
          if (this.ctx !== ctx) return;
          this.buffers.set(line.id, buffer);
        } catch {
          if (this.ctx === ctx) this.failed.add(line.id);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    };
    this.loading = Promise.allSettled([load(), load()]);
  }
  stop() {
    const current = this.current;
    this.current = null;
    if (current) {
      current.source.onended = null;
      try {
        current.source.stop();
      } catch (error) {
        if (error.name !== 'InvalidStateError') console.warn('Audio source stop failed', error);
      }
      current.source.disconnect();
    }
  }
  reset() {
    this.stop();
    this.generation++;
    this.director.reset();
  }
  startMission(s, mission, targets) {
    this.reset();
    this.now = s.elapsed || 0;
    this.director.start(s, mission, targets);
  }
  event(event, s, targets, muted = false) {
    if (!muted) this.director.event(event, s, targets);
  }
  setMuted(muted) {
    this.enabled = !muted;
    if (muted) {
      this.stop();
      this.director.queue = [];
      this.director.current = null;
    }
    if (this.ctx) this.output.gain.setTargetAtTime(muted ? 0 : 0.68, this.ctx.currentTime, 0.02);
  }
  lineBuffer(line) {
    if (this.buffers.has(line.id)) return this.buffers.get(line.id);
    if (!line.clips || !this.ctx) return null;
    const clips = line.clips.map((id) => this.buffers.get(id));
    if (clips.some((buffer) => !buffer)) return null;
    const rate = clips[0].sampleRate,
      gap = Math.round(rate * 0.06),
      length = clips.reduce((sum, b) => sum + b.length, 0) + gap * (clips.length - 1),
      result = this.ctx.createBuffer(1, length, rate),
      data = result.getChannelData(0);
    let offset = 0;
    for (const clip of clips) {
      data.set(clip.getChannelData(0), offset);
      offset += clip.length + gap;
    }
    this.buffers.set(line.id, result);
    return result;
  }
  update(s, mission, targets, { muted = false, active = true } = {}) {
    this.now = s.elapsed || 0;
    if (active) this.director.observe(s, mission, targets);
    if (muted) {
      this.setMuted(true);
      return;
    }
    this.enabled = true;
    if (!this.ctx || !active) return;
    this.output.gain.setTargetAtTime(0.68, this.ctx.currentTime, 0.025);
    if (this.director.stopRequested) {
      this.stop();
      return;
    }
    let next = this.director.peek(this.now);
    if (this.current) {
      if (!next || next.priority < 90 || next.priority <= this.current.cue.priority) return;
      this.stop();
      this.director.current = null;
    }
    if (!next) return;
    if ((next.line.clips || [next.line.id]).some((id) => this.failed.has(id))) {
      this.director.take(this.now);
      this.director.current = null;
      return;
    }
    const buffer = this.lineBuffer(next.line);
    if (!buffer) return;
    const cue = this.director.take(this.now),
      source = this.ctx.createBufferSource(),
      record = { source, cue, generation: this.generation };
    source.buffer = buffer;
    source.connect(this.output);
    this.current = record;
    source.onended = () => {
      source.disconnect();
      if (this.current !== record || record.generation !== this.generation) return;
      this.current = null;
      this.director.completed(cue, this.now);
    };
    source.start();
    this.onLine?.(cue.line, this.now);
  }
}
