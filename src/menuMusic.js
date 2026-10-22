// Traditional melody: Madárka, madárka / Csácsogó madárka (Vidd el a levelem).
// Melody transcribed from ImMusic toolkit, p.24; ornaments simplified, original arrangement.
// https://www.tudatosifjusag.hu/wp-content/uploads/2025/03/ImMusic_toolkit.pdf
import { readPreference, writePreference } from './ui/preferences.js';
import { tr } from './i18n.js';

export const MUSIC_KEY = 'falcon-menu-music';
export const MENU_TEMPO = 66;
// MIDI pitch / quarter-note duration. Preserve the folk tune's changing 3/4 and 2/4 metre.
export const MELODY_BARS = [
  [
    [62, 1],
    [67, 1],
    [65, 0.5],
    [64, 0.5],
  ],
  [
    [62, 2],
    [62, 1],
  ],
  [
    [69, 1],
    [74, 1],
    [72, 0.5],
    [71, 0.5],
  ],
  [
    [69, 2],
    [69, 1],
  ],
  [
    [69, 1],
    [69, 0.5],
    [67, 0.5],
  ],
  [
    [72, 0.5],
    [71, 0.5],
    [69, 1],
  ],
  [
    [65, 1],
    [65, 0.5],
    [62, 0.5],
  ],
  [
    [65, 0.5],
    [67, 0.5],
    [69, 1],
  ],
  [
    [62, 1],
    [67, 1],
    [65, 0.5],
    [64, 0.5],
  ],
  [
    [62, 2],
    [62, 1],
  ],
];
const HARMONY = [
  [50, 57, 65],
  [50, 57, 65],
  [43, 59, 62],
  [45, 55, 60],
  [50, 57, 65],
  [43, 59, 62],
  [46, 53, 62],
  [43, 59, 62],
  [50, 57, 65],
  [50, 57, 65],
];
export function menuArrangement() {
  const beat = 60 / MENU_TEMPO,
    events = [];
  let time = 4 * beat;
  events.push({ voice: 'strings', pitches: [50, 57, 65], start: 0, duration: 4 * beat });
  for (let verse = 0; verse < 2; verse++) {
    for (let bar = 0; bar < MELODY_BARS.length; bar++) {
      const duration = MELODY_BARS[bar].reduce((sum, [, length]) => sum + length, 0) * beat;
      events.push({ voice: 'strings', pitches: HARMONY[bar], start: time, duration });
      events.push({
        voice: 'bass',
        pitches: [HARMONY[bar][0] - 12],
        start: time,
        duration: duration * 0.85,
      });
      let noteTime = time;
      for (const [pitch, length] of MELODY_BARS[bar]) {
        events.push({
          voice: 'horn',
          pitches: [pitch],
          start: noteTime,
          duration: length * beat * 0.91,
        });
        if (verse)
          events.push({
            voice: 'upper',
            pitches: [pitch + 12],
            start: noteTime,
            duration: length * beat * 0.9,
          });
        noteTime += length * beat;
      }
      events.push({ voice: 'drum', start: time, duration: 0.3 });
      if (verse || bar > 3)
        for (let i = 0; i < 3; i++)
          events.push({
            voice: 'snare',
            start: time + duration - beat * (0.6 - i * 0.14),
            duration: 0.08,
          });
      time += duration;
    }
  }
  return { duration: time + 4 * beat, events };
}
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
export async function renderMenuMusic(sampleRate = 44100) {
  const arrangement = menuArrangement(),
    context = new OfflineAudioContext(2, Math.ceil(arrangement.duration * sampleRate), sampleRate),
    master = context.createGain(),
    compressor = context.createDynamicsCompressor();
  master.gain.value = 0.3;
  compressor.threshold.value = -18;
  compressor.ratio.value = 3;
  compressor.knee.value = 12;
  master.connect(compressor).connect(context.destination);
  const reverb = context.createConvolver(),
    wet = context.createGain(),
    impulse = context.createBuffer(2, Math.floor(sampleRate * 1.8), sampleRate);
  let seed = 14;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 0x100000000) * 2 - 1;
  };
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < data.length; i++) data[i] = noise() * (1 - i / data.length) ** 3 * 0.4;
  }
  reverb.buffer = impulse;
  wet.gain.value = 0.16;
  master.connect(reverb).connect(wet).connect(compressor);
  const horn = context.createPeriodicWave(
    new Float32Array(9),
    new Float32Array([0, 1, 0.48, 0.25, 0.11, 0.06, 0.035, 0.02, 0.01]),
  );
  const noiseBuffer = context.createBuffer(1, Math.ceil(sampleRate * 0.15), sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = noise();
  for (const event of arrangement.events) {
    const start = event.start + 0.02,
      end = start + event.duration;
    if (event.voice === 'snare') {
      const source = context.createBufferSource(),
        filter = context.createBiquadFilter(),
        gain = context.createGain();
      source.buffer = noiseBuffer;
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      filter.Q.value = 0.7;
      gain.gain.setValueAtTime(0.017, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      source.connect(filter).connect(gain).connect(master);
      source.start(start);
      source.stop(end);
      continue;
    }
    if (event.voice === 'drum') {
      const source = context.createOscillator(),
        gain = context.createGain();
      source.frequency.setValueAtTime(75, start);
      source.frequency.exponentialRampToValueAtTime(38, end);
      gain.gain.setValueAtTime(0.075, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      source.connect(gain).connect(master);
      source.start(start);
      source.stop(end);
      continue;
    }
    for (const pitch of event.pitches) {
      const pad = event.voice === 'strings',
        lead = event.voice === 'horn',
        bass = event.voice === 'bass',
        gain = context.createGain(),
        filter = context.createBiquadFilter(),
        level = lead ? 0.18 : pad ? 0.038 : bass ? 0.11 : 0.026,
        attack = pad ? 0.5 : lead ? 0.07 : 0.12,
        release = pad ? 0.85 : 0.32;
      filter.type = 'lowpass';
      filter.frequency.value = lead ? 1600 : pad ? 900 : 600;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + Math.min(attack, event.duration * 0.4));
      gain.gain.setValueAtTime(level * 0.78, Math.max(start + attack, end - 0.1));
      gain.gain.linearRampToValueAtTime(0, end + release);
      gain.connect(filter).connect(master);
      for (const detune of pad ? [-5, 5] : [0]) {
        const source = context.createOscillator();
        if (lead) source.setPeriodicWave(horn);
        else source.type = pad ? 'sawtooth' : bass ? 'triangle' : 'sine';
        source.frequency.value = frequency(pitch);
        source.detune.value = detune;
        source.connect(gain);
        source.start(start);
        source.stop(end + release + 0.01);
      }
    }
  }
  const buffer = await context.startRendering();
  let peak = 0,
    sum = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (const value of data) {
      peak = Math.max(peak, Math.abs(value));
      sum += value * value;
    }
  }
  return { buffer, peak, rms: Math.sqrt(sum / (buffer.length * buffer.numberOfChannels)) };
}
const OWNER_KEY = 'falcon-menu-music-owner';
const MUSIC_LOCK = 'operation-falcon-menu-music';
let menuPlayer;
export class MenuMusic {
  constructor(button) {
    // One player even if the menu is mounted again in the same document.
    if (menuPlayer) return menuPlayer;
    menuPlayer = this;
    this.button = button;
    this.owner = crypto.randomUUID();
    this.epoch = 0;
    this.locks = navigator.locks;
    this.createContext = () => new AudioContext();
    this.renderMusic = renderMenuMusic;
    this.enabled = readPreference(MUSIC_KEY) !== 'off';
    this.active = true;
    this.refresh();
    button.onclick = () => {
      this.enabled = !this.enabled;
      writePreference(MUSIC_KEY, this.enabled ? 'on' : 'off');
      this.channel?.postMessage({ enabled: this.enabled });
      this.refresh();
      this.sync(true);
    };
    const unlock = () => {
      if (this.active && this.enabled) this.sync(true);
    };
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => this.sync());
    addEventListener('falcon:languagechange', () => this.refresh());
    addEventListener('pagehide', () => this.stop());
    addEventListener('storage', (event) => {
      if (event.key === MUSIC_KEY) this.receiveEnabled(event.newValue !== 'off');
      if (!this.locks && event.key === OWNER_KEY && event.newValue !== this.owner) this.stop();
    });
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(MUSIC_LOCK);
      this.channel.onmessage = ({ data }) => {
        if (typeof data?.enabled === 'boolean') this.receiveEnabled(data.enabled);
      };
    }
    button.dataset.state = this.enabled ? 'waiting' : 'silent';
  }
  receiveEnabled(enabled) {
    this.enabled = enabled;
    this.refresh();
    this.sync();
  }
  refresh() {
    this.button.setAttribute('aria-pressed', String(this.enabled));
    this.button.setAttribute(
      'aria-label',
      tr(this.enabled ? 'Menüzene kikapcsolása' : 'Menüzene bekapcsolása'),
    );
    this.button.title = tr(
      this.enabled ? 'Madárka, madárka · menüzene bekapcsolva' : 'Menüzene kikapcsolva',
    );
    this.button.innerHTML = `<span aria-hidden="true">${this.enabled ? '♫' : '♪'}</span><span>${tr(this.enabled ? 'ZENE BE' : 'ZENE KI')}</span>`;
  }
  setActive(active) {
    this.active = active;
    this.sync();
  }
  get wanted() {
    return this.active && this.enabled && !document.hidden;
  }
  stop() {
    this.epoch++;
    if (this.source) {
      this.source.stop();
      this.source.disconnect();
    }
    this.source = null;
    if (this.ctx) {
      this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.ctx.suspend().catch(() => {});
    }
    this.releaseLock?.();
    this.button.dataset.state = 'silent';
  }
  sync(gesture = false) {
    if (!this.wanted) {
      this.stop();
      return;
    }
    if (gesture) this.unlocked = true;
    if (!this.unlocked || this.lockRequest || this.startTask || this.source) return;
    const requestedEpoch = this.epoch;
    if (this.locks) {
      let owned = false;
      this.lockRequest = this.locks
        .request(MUSIC_LOCK, { ifAvailable: true }, async (lock) => {
          if (!lock || !this.wanted) {
            this.button.dataset.state = this.wanted ? 'elsewhere' : 'silent';
            return;
          }
          owned = true;
          const held = new Promise((resolve) => {
            this.releaseLock = resolve;
          });
          await this.playOnce();
          if (!this.source || !this.wanted) this.releaseLock();
          await held;
          this.releaseLock = null;
        })
        .catch(() => {
          this.button.dataset.state = 'unavailable';
        })
        .finally(() => {
          this.lockRequest = null;
          if (owned && requestedEpoch !== this.epoch && this.wanted && !this.source) this.sync();
        });
    } else {
      // Older browsers still stop a previous owner through the storage event.
      writePreference(OWNER_KEY, this.owner);
      this.startTask = this.playOnce().finally(() => {
        this.startTask = null;
        if (requestedEpoch !== this.epoch && this.wanted && !this.source) this.sync();
      });
    }
  }
  async playOnce() {
    const epoch = this.epoch;
    try {
      if (!this.ctx) {
        this.ctx = this.createContext();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0;
        this.gain.connect(this.ctx.destination);
        this.rendering = this.renderMusic(this.ctx.sampleRate);
      }
      await this.ctx.resume();
      const rendered = await this.rendering;
      if (epoch !== this.epoch || !this.wanted) return;
      if (!this.source) {
        this.source = this.ctx.createBufferSource();
        this.source.buffer = rendered.buffer;
        this.source.loop = true;
        this.source.connect(this.gain);
        this.source.start();
      }
      this.gain.gain.setTargetAtTime(0.8, this.ctx.currentTime, 0.65);
      this.button.dataset.state = this.ctx.state === 'running' ? 'playing' : 'waiting';
    } catch {
      this.button.dataset.state = 'unavailable';
    }
  }
}
