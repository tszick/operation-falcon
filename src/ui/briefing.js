import { missionWeather, weatherBrief } from '../flightEnvironment.js';
import { missionGroups } from '../missionCatalog.js';
import { trHtml, tr } from '../i18n.js';
import { missionForSide } from '../missionSides.js';
import { escapeHtml as escape } from './html.js';
import { missionLocation, mapPosition } from '../missionLocations.js';
import { renderAircraftPreview } from '../renderer.js';
import { cataloguePages } from '../aircraftCatalog.js';
import { nationalityMarkup } from '../aircraftNations.js';

const stages = ['missions', 'aircraft', 'equipment'];
export class Briefing {
  constructor({ missions, onPreview, onMission, onAircraft }) {
    this.root = document.getElementById('hangar');
    this.step = 'missions';
    this.confirmed = false;
    this.missions = missions;
    this.onPreview = onPreview;
    this.onMission = onMission;
    this.onAircraft = onAircraft;
    this.selectedMission = null;
    this.cardsKey = '';
    this.tooltip = document.getElementById('map-tooltip');
    this.list = document.getElementById('aircraft-list');
    this.largeCatalogue = window.matchMedia('(min-width: 1100px) and (min-height: 880px)');
    this.largeCatalogue.addEventListener('change', () => {
      if (this.choices) this.update(this.mission, this.selected, this.choices);
    });
    this.wiki = document.getElementById('planner-wiki');
    this.mountMap();
    this.root.addEventListener('click', (event) => {
      const step = event.target.closest('[data-planner-step]');
      if (step) this.show(step.dataset.plannerStep);
      const info = event.target.closest('[data-wiki]');
      if (info) this.openWiki(info.dataset.wiki);
    });
    document.getElementById('mission-next').onclick = () => this.show('aircraft');
    document.getElementById('aircraft-continue').onclick = () => this.show('equipment');
    document.getElementById('aircraft-prev').onclick = () => this.cycle(-1);
    document.getElementById('aircraft-next').onclick = () => this.cycle(1);
    this.list.addEventListener('click', (event) => {
      if (this.ignoreSwipeClick) {
        this.ignoreSwipeClick = false;
        return;
      }
      const card = event.target.closest('[data-aircraft]');
      if (card) this.onAircraft(this.choices.find((a) => a.id === card.dataset.aircraft));
    });
    this.list.addEventListener('keydown', (event) => {
      if (event.target.closest('[data-wiki]')) return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') this.turnTo(0);
      else if (event.key === 'End') this.turnTo(this.pages.length - 1);
      else this.cycle(event.key === 'ArrowLeft' ? -1 : 1);
      this.list.focus({ preventScroll: true });
    });
    this.list.addEventListener('pointerdown', (event) => {
      this.ignoreSwipeClick = false;
      this.swipeStart = event.clientX;
    });
    this.list.addEventListener('pointerup', (event) => {
      if (this.swipeStart == null) return;
      const delta = event.clientX - this.swipeStart;
      this.swipeStart = null;
      if (Math.abs(delta) > 65) {
        this.ignoreSwipeClick = true;
        this.cycle(delta < 0 ? 1 : -1);
      }
    });
    this.list.addEventListener('pointercancel', () => {
      this.swipeStart = null;
    });
    for (const button of this.root.querySelectorAll('[data-catalogue-section]'))
      button.onclick = () =>
        this.turnTo(this.pages.findIndex((p) => p.side === button.dataset.catalogueSection));
    // Native dialog supplies focus trapping, Escape dismissal and return focus.
    document.getElementById('wiki-close').onclick = () => this.wiki.close();
    this.wiki.addEventListener('close', () => {
      document.getElementById('wiki-frame').removeAttribute('src');
    });
  }
  mountMap() {
    document.getElementById('mission-markers').innerHTML = trHtml(
      this.missions
        .map((m) => {
          const location = missionLocation(m),
            p = mapPosition(location);
          return `<button class="map-pin ${m.group === 'practice' ? 'practice-pin' : m.group === 'flight-test' ? 'flight-test-pin' : ''}" data-mission="${escape(m.id)}" style="left:${p.x}%;top:${p.y}%" aria-label="${escape(m.name)} — ${escape(location.name)}" aria-pressed="false" aria-describedby="map-tooltip"><span></span></button>`;
        })
        .join(''),
    );
    document.getElementById('map-mission-list').innerHTML = trHtml(
      missionGroups
        .map(
          ({ id: group, name }) =>
            `<details ${group === 'practice' ? 'open' : ''}><summary>${escape(name)}</summary><div>${this.missions
              .filter((m) => m.group === group)
              .map(
                (m) =>
                  `<button data-mission="${escape(m.id)}" aria-pressed="false"><span>${String(m.order).padStart(2, '0')}</span> ${escape(m.name)} <small>${escape(m.difficulty)}</small></button>`,
              )
              .join('')}</div></details>`,
        )
        .join(''),
    );
    const map = document.getElementById('missions');
    const preview = (button) => {
      const m = this.missions.find((m) => m.id === button.dataset.mission);
      this.onPreview(m);
      if (button.classList.contains('map-pin')) {
        this.tooltip.textContent = tr(missionForSide(m, this.side).name);
        this.tooltip.hidden = false;
        this.tooltip.style.left = button.style.left;
        this.tooltip.style.top = button.style.top;
      }
    };
    for (const host of [map, document.getElementById('map-mission-list')]) {
      host.addEventListener('pointerover', (e) => {
        const button = e.target.closest('[data-mission]');
        if (button && !button.contains(e.relatedTarget)) preview(button);
      });
      host.addEventListener('focusin', (e) => {
        const button = e.target.closest('[data-mission]');
        if (button) preview(button);
      });
      host.addEventListener('click', (e) => {
        const button = e.target.closest('[data-mission]');
        if (!button) return;
        this.confirmed = true;
        this.pageIndex = 0;
        this.selectedMission = this.missions.find((m) => m.id === button.dataset.mission);
        this.onMission(this.selectedMission);
      });
      host.addEventListener('pointerleave', () => this.restorePreview());
      host.addEventListener('focusout', (e) => {
        if (!host.contains(e.relatedTarget)) this.restorePreview();
      });
    }
  }
  restorePreview() {
    this.tooltip.hidden = true;
    this.onPreview(this.selectedMission);
  }
  update(mission, selected, choices) {
    this.mission = mission;
    this.side = mission.side || 'west';
    document.getElementById('aircraft-side-label').textContent = tr('ELÉRHETŐ TÍPUS');
    this.selected = selected;
    this.choices = choices;
    for (const pin of this.root.querySelectorAll('[data-mission]')) {
      pin.setAttribute(
        'aria-pressed',
        String(this.confirmed && pin.dataset.mission === mission.id),
      );
    }
    document.getElementById('mission-next').disabled = !this.confirmed;
    document.getElementById('mission-selection-status').textContent = tr(
      this.confirmed
        ? `KIJELÖLVE / ${mission.name} · ${missionLocation(mission).name}`
        : 'Nincs kiválasztott küldetés',
    );
    document.getElementById('aircraft-mission-context').textContent = tr(
      `${mission.name} / ${missionLocation(mission).name}`,
    );
    document.getElementById('aircraft-wiki').onclick = () => this.openWiki(selected.id);
    document.getElementById('equipment-wiki').onclick = () => this.openWiki(selected.id);
    document.getElementById('equipment-context').textContent = tr(
      selected.name + ' / ' + mission.name,
    );
    document.getElementById('launch-summary').textContent = tr(selected.name);
    document.getElementById('equipment-mission-name').textContent = tr(mission.name);
    document.getElementById('equipment-brief').textContent =
      tr(mission.description) +
      ' ' +
      tr(weatherBrief(missionWeather(mission))) +
      '.' +
      (selected.testProfile
        ? ' ' +
          tr(
            'Stabil repülés: ' +
              selected.testProfile.altitude +
              ' m · IAS ' +
              selected.testProfile.ias +
              ' km/h · 12 s',
          )
        : '');
    document.getElementById('equipment-objectives').innerHTML = trHtml(
      '<h3>ELSŐDLEGES CÉLOK</h3><ol>' +
        mission.primary.map((p) => `<li>${escape(p)}</li>`).join('') +
        '</ol>',
    );
    const pageSize = this.largeCatalogue.matches ? 6 : 3;
    const key = mission.id + ':' + pageSize + ':' + choices.map((a) => a.id).join(',');
    if (this.cardsKey !== key) {
      this.cardsKey = key;
      this.pages = cataloguePages(choices, pageSize);
      this.pageIndex = Math.max(
        0,
        this.pages.findIndex((p) => p.aircraft.includes(selected)),
      );
      this.list.innerHTML = trHtml(
        this.pages
          .map(
            (page, i) =>
              `<div class="catalogue-page" data-page="${i}" hidden>${page.aircraft
                .map(
                  (a) =>
                    `<button type="button" class="aircraft-card" data-aircraft="${escape(a.id)}" aria-pressed="false">${nationalityMarkup(a, { flagsOnly: true })}<canvas data-card-art="${escape(a.id)}" aria-label="${escape(a.name)} kitöltött térbeli modellje"></canvas><strong>${escape(a.name)}</strong></button>`,
                )
                .join('')}</div>`,
          )
          .join(''),
      );
    }
    for (const card of this.list.querySelectorAll('[data-aircraft]')) {
      const active = card.dataset.aircraft === selected.id;
      card.setAttribute('aria-pressed', String(active));
      card.tabIndex = 0;
    }
    this.scrollSelection();
    this.updateSteps();
  }
  updateSteps() {
    for (const button of this.root.querySelectorAll('[data-planner-step]')) {
      button.disabled = button.dataset.plannerStep !== 'missions' && !this.confirmed;
      if (button.dataset.plannerStep === this.step) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    }
  }
  scrollSelection() {
    if (!this.pages) return;
    for (const page of this.list.querySelectorAll('[data-page]'))
      page.hidden = Number(page.dataset.page) !== this.pageIndex;
    const page = this.pages[this.pageIndex];
    document.getElementById('selected-name').textContent = tr(this.selected.name);
    document.getElementById('aircraft-page').textContent = tr(
      `${this.pageIndex + 1} / ${this.pages.length} · ${page.side === 'west' ? 'NYUGAT' : 'KELET'}`,
    );
    document.getElementById('aircraft-prev').disabled = this.pageIndex === 0;
    document.getElementById('aircraft-next').disabled = this.pageIndex === this.pages.length - 1;
    for (const button of this.root.querySelectorAll('[data-catalogue-section]')) {
      button.hidden = !this.pages.some((p) => p.side === button.dataset.catalogueSection);
      button.setAttribute('aria-pressed', String(page.side === button.dataset.catalogueSection));
    }
  }
  turnTo(index) {
    if (!this.pages || index < 0 || index >= this.pages.length || index === this.pageIndex) return;
    const direction = index > this.pageIndex ? 1 : -1;
    this.pageIndex = index;
    this.onAircraft(this.pages[index].aircraft[0]);
    this.scrollSelection();
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 380;
    for (const page of this.list.querySelectorAll('[data-page]'))
      for (const animation of page.getAnimations()) animation.cancel();
    const page = this.list.querySelector(`[data-page="${index}"]`);
    page.animate(
      [
        { transform: `translateX(${direction * 45}px) rotateY(${direction * 5}deg)`, opacity: 0 },
        { transform: 'translateX(0) rotateY(0)', opacity: 1 },
      ],
      { duration, easing: 'cubic-bezier(.2,.7,.2,1)' },
    );
  }

  show(step) {
    if (!stages.includes(step) || (step !== 'missions' && !this.confirmed)) return;
    this.step = step;
    this.root.dataset.step = step;
    for (const id of stages)
      document.getElementById(id === 'missions' ? 'mission-stage' : `${id}-stage`).hidden =
        step !== id;
    this.updateSteps();
    this.scrollSelection();
    this.root.querySelector('.briefing-stage:not([hidden]) h1').tabIndex = -1;
    this.root.querySelector('.briefing-stage:not([hidden]) h1').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  cycle(direction) {
    this.turnTo(this.pageIndex + direction);
  }
  openWiki(id) {
    document.getElementById('wiki-frame').src =
      '/encyclopedia.html?embedded=1#' + encodeURIComponent(id);
    if (!this.wiki.open) this.wiki.showModal();
  }
  renderCards(time) {
    if (this.step !== 'aircraft') return;
    const bounds = this.list.getBoundingClientRect();
    for (const canvas of this.list.querySelectorAll('canvas')) {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || rect.right < bounds.left || rect.left > bounds.right) continue;
      const spec = this.choices.find((a) => a.id === canvas.dataset.cardArt);
      renderAircraftPreview(canvas, spec, time, null, 'textured', { decorations: false });
    }
  }
}
