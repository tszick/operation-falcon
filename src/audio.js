import { afterburnerActive } from './engineState.js';
import { RadioComms } from './radioComms.js';
import { CockpitAlerts } from './cockpitAlerts.js';
import { right, clamp } from './math.js';
// Filtered broadband airflow plus a quiet turbine whine; no piston-like sawtooth.
export const ENGINE_VOLUME = 0.009;
export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.alerts = new CockpitAlerts();
    this.radio = new RadioComms();
    this.sources = new Set();
  }
  start() {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = ENGINE_VOLUME;
        this.gain.connect(this.ctx.destination);
        this.warningGain = this.ctx.createGain();
        this.warningGain.gain.value = 1;
        this.warningGain.connect(this.ctx.destination);
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate),
          data = buffer.getChannelData(0);
        let low = 0;
        for (let i = 0; i < data.length; i++) {
          const white = Math.random() * 2 - 1;
          low = (low + 0.02 * white) / 1.02;
          data[i] = low * 3 + white * 0.35;
        }
        this.air = this.ctx.createBufferSource();
        this.air.buffer = buffer;
        this.air.loop = true;
        this.highpass = this.ctx.createBiquadFilter();
        this.highpass.type = 'highpass';
        this.highpass.frequency.value = 110;
        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 1200;
        this.filter.Q.value = 0.45;
        this.airGain = this.ctx.createGain();
        this.airGain.gain.value = 0;
        this.air
          .connect(this.highpass)
          .connect(this.filter)
          .connect(this.airGain)
          .connect(this.gain);
        this.air.start();
        this.engine = this.ctx.createOscillator();
        this.engine.type = 'sine';
        this.engine.frequency.value = 850;
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        this.engine.connect(this.engineGain).connect(this.gain);
        this.engine.start();
        this.createEffectsBus();
      }
      this.radio.attach(this.ctx);
      this.ctx.resume().catch(() => {});
    } catch {
      this.ctx = null;
    }
  }
  createEffectsBus() {
    const c = this.ctx;
    this.fxOutput = c.createGain();
    this.fxOutput.gain.value = 0.24;
    this.fxLimiter = c.createDynamicsCompressor();
    this.fxLimiter.threshold.value = -16;
    this.fxLimiter.knee.value = 12;
    this.fxLimiter.ratio.value = 5;
    this.fxLimiter.attack.value = 0.003;
    this.fxLimiter.release.value = 0.18;
    this.fxLimiter.connect(this.fxOutput).connect(c.destination);
    this.fxNoise = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
    const data = this.fxNoise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  track(source) {
    if (this.sources.size >= 48) {
      source.disconnect();
      return false;
    }
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source._cleanup?.();
      source.disconnect();
    };
    return true;
  }
  clearEffects() {
    this.radio.reset();
    this.alerts.reset();
    for (const source of this.sources) {
      try {
        source.stop();
      } catch (error) {
        if (error.name !== 'InvalidStateError') console.warn('Audio source stop failed', error);
      }
      source._cleanup?.();
      source.disconnect();
    }
    this.sources.clear();
  }
  noise({
    when = this.ctx.currentTime,
    duration = 0.1,
    volume = 0.2,
    frequency = 1800,
    endFrequency = frequency,
    highpass = 80,
    pan = 0,
    attack = 0.002,
  }) {
    const c = this.ctx,
      source = c.createBufferSource(),
      hp = c.createBiquadFilter(),
      lp = c.createBiquadFilter(),
      gain = c.createGain(),
      stereo = c.createStereoPanner();
    if (!this.track(source)) return;
    source._cleanup = () => {
      hp.disconnect();
      lp.disconnect();
      gain.disconnect();
      stereo.disconnect();
    };
    source.buffer = this.fxNoise;
    source.playbackRate.value = 0.94 + Math.random() * 0.12;
    hp.type = 'highpass';
    hp.frequency.value = highpass;
    lp.type = 'lowpass';
    lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(frequency, when);
    lp.frequency.exponentialRampToValueAtTime(Math.max(40, endFrequency), when + duration);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    stereo.pan.value = clamp(pan, -1, 1);
    source.connect(hp).connect(lp).connect(gain).connect(stereo).connect(this.fxLimiter);
    source.start(
      when,
      Math.random() * Math.max(0.01, this.fxNoise.duration - duration - 0.4),
      duration,
    );
    source.stop(when + duration + 0.01);
  }
  thump({
    when = this.ctx.currentTime,
    duration = 0.2,
    volume = 0.2,
    frequency = 120,
    endFrequency = 40,
    pan = 0,
  }) {
    const c = this.ctx,
      source = c.createOscillator(),
      gain = c.createGain(),
      stereo = c.createStereoPanner();
    if (!this.track(source)) return;
    source._cleanup = () => {
      gain.disconnect();
      stereo.disconnect();
    };
    source.type = 'sine';
    source.frequency.setValueAtTime(frequency, when);
    source.frequency.exponentialRampToValueAtTime(endFrequency, when + duration);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), when + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    stereo.pan.value = clamp(pan, -1, 1);
    source.connect(gain).connect(stereo).connect(this.fxLimiter);
    source.start(when);
    source.stop(when + duration + 0.01);
  }
  playEvent(event, s, targets = []) {
    this.radio.event(event, s, targets, this.muted);
    if (!this.ctx || this.muted || !this.fxOutput) return;
    const delta = event.position?.clone().sub(s.position),
      distance = delta?.length() || 0;
    const pan = delta
      ? clamp(delta.dot(right(s.orientation)) / Math.max(10, distance), -0.9, 0.9)
      : 0;
    const time = this.ctx.currentTime,
      shotGain = event.owner === 'enemy' ? 1 / (1 + (distance / 1200) ** 1.4) : 1;
    if (event.type === 'damage-hit') {
      this.noise({
        duration: 0.045,
        volume: 0.16,
        frequency: 2500,
        endFrequency: 500,
        highpass: 200,
        pan,
      });
      this.thump({ duration: 0.08, volume: 0.1, frequency: 110, endFrequency: 45, pan });
    } else if (event.type === 'gun') {
      // Several close crack transients create a rotary-cannon burst, not a beep.
      for (let i = 0; i < 3; i++)
        this.noise({
          when: time + i * 0.012,
          duration: 0.045,
          volume: 0.24 * shotGain,
          frequency: 5100,
          endFrequency: 1500,
          highpass: 380,
          pan,
        });
      this.thump({
        when: time,
        duration: 0.075,
        volume: 0.13 * shotGain,
        frequency: 150,
        endFrequency: 65,
        pan,
      });
    } else if (event.type === 'missile-launch') {
      this.noise({
        duration: 0.13,
        volume: 0.5 * shotGain,
        frequency: 4800,
        endFrequency: 700,
        highpass: 100,
        pan,
      });
      this.thump({
        duration: 0.22,
        volume: 0.22 * shotGain,
        frequency: 125,
        endFrequency: 38,
        pan,
      });
      this.noise({
        when: time + 0.045,
        duration: 1.45,
        volume: 0.28 * shotGain,
        frequency: 4200,
        endFrequency: 350,
        highpass: 120,
        pan,
        attack: 0.025,
      });
    } else if (event.type === 'countermeasure-release') {
      if (event.sourceId && distance > 8000) return;
      this.noise({
        duration: 0.12,
        volume: 0.12 * (event.sourceId ? 1 / (1 + (distance / 800) ** 2) : 1),
        frequency: 4200,
        endFrequency: 1100,
        highpass: 800,
        pan,
      });
    } else if (event.type === 'bomb-release') {
      this.noise({
        duration: 0.09,
        volume: 0.12,
        frequency: 2600,
        endFrequency: 700,
        highpass: 500,
        pan,
      });
      this.thump({ duration: 0.07, volume: 0.065, frequency: 230, endFrequency: 95, pan });
    } else if (event.type === 'dry-fire') {
      this.noise({ duration: 0.025, volume: 0.09, frequency: 3100, highpass: 1400, pan });
    } else if (event.type === 'explosion') {
      // Distant blasts arrive later and lose high frequencies; the delay is capped for playability.
      const attenuation = 1 / (1 + (distance / 1800) ** 1.25),
        when = time + Math.min(2.5, distance / 343),
        heavy = event.heavy ? 1.3 : 1;
      const cutoff = clamp(6200 / (1 + distance / 1500), 550, 6200);
      this.noise({
        when,
        duration: 0.24,
        volume: 0.75 * attenuation * heavy,
        frequency: cutoff,
        endFrequency: 400,
        highpass: 70,
        pan,
      });
      this.thump({
        when: when + 0.015,
        duration: 1.1,
        volume: 0.5 * attenuation * heavy,
        frequency: 90,
        endFrequency: 28,
        pan,
      });
      this.noise({
        when: when + 0.07,
        duration: event.ground ? 2.7 : 1.9,
        volume: 0.45 * attenuation * heavy,
        frequency: 1000,
        endFrequency: 110,
        highpass: 30,
        pan,
        attack: 0.04,
      });
      if (distance < 3500)
        for (let i = 0; i < 3; i++)
          this.noise({
            when: when + 0.14 + i * 0.12,
            duration: 0.09,
            volume: 0.07 * attenuation,
            frequency: 2800,
            endFrequency: 900,
            highpass: 700,
            pan: clamp(pan + (i - 1) * 0.16, -1, 1),
          });
    }
  }
  tone(freq = 440, duration = 0.12, type = 'sine', volume = 0.012) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain(),
      t = this.ctx.currentTime;
    if (!this.track(o)) return;
    o._cleanup = () => g.disconnect();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(this.warningGain);
    o.start(t);
    o.stop(t + duration);
  }
  update(s, aim, active, mission = null, targets = []) {
    if (mission)
      this.radio.update(s, mission, targets, {
        muted: this.muted,
        active:
          active || !!((mission.complete || mission.recovered) && s.onGround && s.landing?.success),
      });
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.fxOutput?.gain.setTargetAtTime(this.muted || !active ? 0 : 0.24, t, 0.025);
    const ab = afterburnerActive(s);
    this.gain.gain.setTargetAtTime(this.muted || !active ? 0 : ENGINE_VOLUME, t, 0.12);
    this.engine.frequency.setTargetAtTime(850 + s.throttle * 1600 + (ab ? 180 : 0), t, 0.3);
    this.engineGain.gain.setTargetAtTime(
      s.fuel > 0 && !s.dying && !s.crashed
        ? (0.015 + s.throttle * 0.035) * (s.enginePower ?? 1)
        : 0,
      t,
      0.3,
    );
    this.filter.frequency.setTargetAtTime(900 + s.throttle * 3600 + (ab ? 1800 : 0), t, 0.3);
    this.airGain.gain.setTargetAtTime(
      s.fuel > 0 && !s.dying && !s.crashed
        ? (0.1 + s.throttle * 0.38 + (ab ? 0.13 : 0)) * (s.enginePower ?? 1)
        : 0,
      t,
      0.3,
    );
    this.warningGain?.gain.setTargetAtTime(this.muted || !active ? 0 : 1, t, 0.015);
    if (!active || this.muted) return;
    // Flight time freezes the burst during pause; no scheduled catch-up beeps.
    const alert = this.alerts.next(s, aim);
    if (alert) this.tone(alert.frequency, alert.duration, alert.type, alert.volume);
  }
  mute() {
    this.muted = !this.muted;
    this.radio.setMuted(this.muted);
    if (this.ctx)
      this.warningGain?.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.015);
    if (this.ctx)
      this.fxOutput?.gain.setTargetAtTime(this.muted ? 0 : 0.24, this.ctx.currentTime, 0.02);
  }
  suspend({ radio = false } = {}) {
    if (this.ctx) {
      this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.warningGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      this.fxOutput?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      if (radio) this.ctx.resume().catch(() => {});
      else this.ctx.suspend().catch(() => {});
    }
  }
}
