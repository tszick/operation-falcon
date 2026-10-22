import { missionRating } from '../missionRating.js';
import { evaluateFlight, debriefMarkup } from '../flightDebrief.js';
import { FlightReplay, highlightCamera } from '../flightReplay.js';
import { tr, trHtml } from '../i18n.js';
import { escapeHtml } from './html.js';

const clock = (time) =>
  `${Math.floor(time / 60)}:${Math.floor(time % 60)
    .toString()
    .padStart(2, '0')}`;
export function ratingMarkup(log) {
  const analysis = evaluateFlight(log),
    rating = missionRating(log, analysis);
  const stars = Array.from(
    { length: 3 },
    (_, index) =>
      `<span class="${index < rating.stars ? 'earned' : ''}" aria-hidden="true">★</span>`,
  ).join('');
  return `<div class="result-mission">${escapeHtml(log.metadata?.mission?.name || '')}</div>
    <div class="result-stars" role="img" aria-label="${rating.stars} / 3">${stars}</div>
    <div class="result-rating" data-stars="${rating.stars}">
      <div class="result-dial" style="--rating:${rating.percent}%" role="meter" aria-label="${tr('Küldetés értékelése')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${rating.percent}"><strong>${rating.percent}<small>%</small></strong></div>
      <div><span class="result-kicker">KÜLDETÉS ÉRTÉKELÉSE</span><h3>${escapeHtml(rating.label)}</h3><p>${rating.successful ? 'A feladat teljesült. Minden repülés számít.' : 'Új bevetés, új lehetőség.'}</p></div>
    </div><div class="result-facts"><span><small>REPÜLT IDŐ</small><b>${clock(rating.duration)}</b></span><span><small>TELJESÍTETT CÉLOK</small><b>${rating.completed} / ${rating.total || '—'}</b></span><span><small>PONTSZÁM</small><b>${rating.score}</b></span></div>`;
}
export class MissionResultView {
  constructor(renderer) {
    this.renderer = renderer;
    this.overlay = document.getElementById('overlay');
    this.summary = document.getElementById('mission-rating');
    this.caption = document.getElementById('replay-caption');
    this.toggle = document.getElementById('replay-toggle');
    this.toggle.onclick = () => {
      this.moving = !this.moving;
      this.updateToggle();
    };
    addEventListener('falcon:languagechange', () => {
      if (this.active) this.populate();
    });
  }
  populate() {
    this.summary.innerHTML = trHtml(ratingMarkup(this.log));
    const rating = missionRating(this.log);
    const reasons = rating.deductions.length
      ? `<div class="result-deductions"><h3>ÉRTÉKELÉS RÉSZLETEI</h3><ul>${rating.deductions.map((deduction) => `<li>${escapeHtml(deduction.reason)} <b>−${deduction.points}</b></li>`).join('')}</ul></div>`
      : '';
    document.getElementById('mission-debrief').innerHTML = trHtml(
      reasons + debriefMarkup(this.log),
    );
    this.updateToggle();
  }
  show(log) {
    this.hide();
    this.log = log;
    this.active = true;
    this.replay = new FlightReplay(log);
    this.clipIndex = 0;
    this.clipTime = 0;
    this.lastRenderKey = null;
    this.moving = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.overlay.classList.add('mission-result');
    document.body.classList.add('debrief-view');
    this.summary.hidden = false;
    document.getElementById('result-details').open = false;
    this.populate();
    this.render(0);
  }
  updateToggle() {
    this.toggle.hidden = !this.replay?.clips.length;
    this.toggle.textContent = tr(
      this.moving ? 'Ⅱ VISSZAJÁTSZÁS SZÜNETELTETÉSE' : '▷ VISSZAJÁTSZÁS INDÍTÁSA',
    );
    this.toggle.setAttribute('aria-pressed', String(this.moving));
  }
  render(delta) {
    const clip = this.replay?.clips[this.clipIndex];
    if (!clip) {
      this.caption.textContent = tr('Nincs elegendő adat a visszajátszáshoz.');
      return;
    }
    if (this.moving) this.clipTime += delta;
    if (this.clipTime > Math.max(1, clip.end - clip.start)) {
      this.clipIndex = (this.clipIndex + 1) % this.replay.clips.length;
      this.clipTime = 0;
      return this.render(0);
    }
    const time = Math.min(clip.end, clip.start + this.clipTime),
      key = `${this.clipIndex}:${time}:${this.renderer.w}:${this.renderer.h}`;
    if (key === this.lastRenderKey) return;
    this.lastRenderKey = key;
    const frame = this.replay.frame(time);
    if (!frame) return;
    this.renderer.cinematic = true;
    const focus = clip.focusId ? frame.targets.find((target) => target.id === clip.focusId) : null;
    this.renderer.replayCamera = highlightCamera(frame.state, focus);
    this.renderer.render(frame.state, frame.targets, frame.weapons, frame.aim);
    const text = `${tr('BEVETÉSI PILLANATOK')} / ${tr(clip.label)} · ${clock(time)}`;
    if (this.caption.textContent !== text) this.caption.textContent = text;
  }
  hide() {
    this.active = false;
    this.replay = null;
    this.renderer.cinematic = false;
    this.renderer.replayCamera = null;
    this.overlay.classList.remove('mission-result');
    document.body.classList.remove('debrief-view');
    this.summary.hidden = true;
  }
}
