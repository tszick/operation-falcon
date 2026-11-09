import { mountCockpit } from '../cockpit.js';
import { updateHUD } from '../hud.js';
import { nextMapZoom, renderTacticalMap } from '../tacticalMap.js';
import { missionPresentation } from './missionView.js';
import { resetFlightMessages, postFlightMessage } from '../flightMessages.js';
import { tr } from '../i18n.js';
const $ = (id) => document.getElementById(id);
export class MultiplayerHUD {
  constructor(actions) {
    this.actions = actions;
    this.state = {};
    this.zoom = 1;
  }
  async mount() {
    // Import only the canonical HUD fragment, never the single-player scripts.
    const response = await fetch('/index.html');
    if (!response.ok) throw new Error('HUD unavailable');
    const source = new DOMParser().parseFromString(await response.text(), 'text/html');
    const fragment = source.getElementById('flight-ui');
    if (!fragment) throw new Error('HUD missing');
    document.body.append(document.importNode(fragment, true));
    mountCockpit();
    for (const [id, toggle] of Object.entries({
      'config-gear': 'gear',
      'config-flaps': 'flaps',
      'config-airbrake': 'airbrake',
      'config-afterburner': 'afterburner',
      'config-assist': 'assist',
      'approach-button': 'landing',
      'landing-route-button': 'landingGuide',
    }))
      $(id).addEventListener('click', () => this.actions.toggle(toggle));
    $('config-countermeasures').addEventListener('click', () => this.actions.countermeasures());
    $('lock-button').addEventListener('click', () => this.actions.cycle());
    $('stores-display').addEventListener('click', (e) => {
      const button = e.target.closest('[data-weapon]');
      if (button && !button.disabled) this.actions.weapon(button.dataset.weapon);
    });
    const brake = $('config-wheel-brake');
    const release = () => this.actions.brake(false);
    brake.addEventListener('pointerdown', (e) => {
      brake.setPointerCapture(e.pointerId);
      this.actions.brake(true);
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
      brake.addEventListener(event, release);
    $('map-range').addEventListener('click', () => this.zoomIn());
    $('close-guide').addEventListener('click', () => this.guide(false));
    $('open-guide').addEventListener('click', () => this.guide(true));
    this.map = document.createElement('dialog');
    this.map.className = 'network-tactical';
    this.map.innerHTML =
      '<button type="button" aria-label="Close">×</button><h2>Mission Control</h2><p></p><canvas width="800" height="600"></canvas><ul></ul>';
    document.body.append(this.map);
    this.map.querySelector('button').addEventListener('click', () => this.map.close());
    $('radar').addEventListener('click', () => this.toggleMap());
    $('radar').addEventListener('keydown', (e) => {
      if (['Enter', ' '].includes(e.key)) {
        e.preventDefault();
        this.toggleMap();
      }
    });
  }
  guide(show) {
    $('phase-guide').hidden = !show;
    $('open-guide').hidden = show;
  }
  zoomIn() {
    this.zoom = nextMapZoom(this.zoom);
  }
  toggleMap() {
    this.actions.release();
    if (this.map.open) this.map.close();
    else this.map.showModal();
  }
  show(value) {
    $('flight-ui').hidden = !value;
    document.body.classList.toggle('flying', value);
    if (!value && this.map.open) this.map.close();
  }
  reset() {
    resetFlightMessages();
    this.state = {};
    this.notice = null;
  }
  postNotices(notices) {
    for (const item of notices)
      postFlightMessage(item.text, this.state.elapsed || 0, item.duration, item);
  }
  update(state, targets, weapons, aim, snapshot, ownId, notice) {
    Object.assign(this.state, state, { team: 'ally', mapZoom: this.zoom });
    const s = this.state,
      m = snapshot.mission,
      view = missionPresentation(m);
    const phase =
      m?.stage === 'return'
        ? 'HAZATÉRÉS'
        : s.approach?.active
          ? 'LESZÁLLÁS'
          : s.onGround
            ? 'FELSZÁLLÁS'
            : 'LÉGIHARC';
    const mission = {
      spec: { name: view?.title || 'Közös gyakorlórepülés', objective: 'multiplayer' },
      phase,
      phaseHint: view?.message || '',
      objectives: [],
    };
    const rows = (m?.objectives || []).map((o, i) => ({
      id: o.id,
      text: view.objectives[i].label,
      optional: o.optional,
      status: o.status === 'complete' ? 'done' : o.status,
      done: o.status === 'complete',
    }));
    if (m?.assignment === 'arena') {
      const survivors = snapshot.players.filter((p) => !p.state.crashed);
      rows.push({
        id: 'arena',
        text: tr('Még versenyben') + ': ' + survivors.length + '/' + snapshot.players.length,
        status: m.phase === 'active' ? 'pending' : m.winnerId === ownId ? 'done' : 'failed',
        optional: false,
      });
    }
    if (!m)
      rows.push({
        id: 'range',
        text:
          'Gyakorlócélok: ' +
          snapshot.combat.targets.filter((t) => t.rangeTarget && !t.alive).length +
          '/2',
        status: 'pending',
        optional: false,
      });
    const count = (optional) => ({
      done: rows.filter((o) => !!o.optional === optional && o.status === 'done').length,
      total: rows.filter((o) => !!o.optional === optional).length,
    });
    const card = {
      name: mission.spec.name,
      elapsed: view?.time || new Date(s.elapsed * 1000).toISOString().slice(14, 19),
      phase,
      priority: '',
      rows,
      primary: count(false),
      optional: count(true),
    };
    const guideSteps = s.approach?.active
      ? [
          { key: 'G', text: 'Futómű kiengedése', done: s.gear },
          { key: 'X', text: 'Fékszárny kiengedése', done: s.flaps },
          { key: 'R / F', text: 'Tartsd a jelzett megközelítési sebességet' },
          { key: 'Ctrl', text: 'Fékezés földet érés után' },
        ]
      : s.onGround
        ? [
            { key: 'R', text: 'Gázadás a felszálláshoz' },
            { key: 'S', text: 'Emeld fel az orrot a felszállósebességnél' },
            { key: 'G / X', text: 'Futómű és fékszárny behúzása' },
          ]
        : [
            { key: 'Tab / T', text: 'Célkijelölés és befogás' },
            { key: '1–4', text: 'Fegyverválasztás' },
            { key: 'Space', text: 'Tüzelés lőtávon belül' },
            { key: 'C', text: 'Elterelők közeledő rakéta ellen' },
          ];
    s.threatWarning = s.incomingMissiles > 0 ? 'RAKÉTA KÖZELEDIK · C: ELTERELŐ' : '';
    updateHUD(s, targets, weapons, aim, mission, true, { card, guideSteps });
    if (notice && notice !== this.notice) postFlightMessage(notice, s.elapsed, 6);
    this.notice = notice;
    document.body.classList.toggle('wreck-view', !!(s.dying || s.crashed));
    if (this.map.open) {
      renderTacticalMap(this.map.querySelector('canvas'), s, targets, aim, {
        width: 800,
        height: 600,
      });
      this.map.querySelector('p').textContent = tr(
        'Online repülés: a térkép megnyitása nem állítja meg a játékot.',
      );
      const list = this.map.querySelector('ul');
      list.replaceChildren(
        ...rows.map((row) => {
          const li = document.createElement('li');
          li.textContent =
            (row.status === 'done' ? '✓ ' : row.status === 'failed' ? '× ' : '○ ') + tr(row.text);
          return li;
        }),
      );
    }
  }
}
