import { aircraft } from '../aircraftSpec.js';
import { defaultSelection, validateSelection } from './preflight.js';
import { stationOptions, plannedDeparture } from '../loadoutPlanner.js';
import { aircraftChoices } from './protocol.js';
import { catalogLabel } from '../equipmentCatalog.js';
import { weaponLabel } from '../armament.js';
import { tr, i18n } from '../i18n.js';
export class PreflightView {
  constructor(root, send) {
    this.root = root;
    this.send = send;
    this.dirty = false;
    this.saving = false;
    this.awaitReady = null;
    this.el = (id) => root.querySelector('[data-preflight="' + id + '"]');
    for (const id of aircraftChoices)
      this.el('aircraft').append(this.option(id, catalogLabel('aircraft', id)));
    this.el('aircraft').addEventListener('change', () => {
      this.draft = {
        ...defaultSelection(this.el('aircraft').value),
        fuelFraction: this.draft.fuelFraction,
      };
      this.dirty = true;
      this.drawFields();
      this.drawState();
    });
    this.el('fuel').addEventListener('input', () => {
      this.draft.fuelFraction = Number(this.el('fuel').value) / 100;
      this.changed();
    });
    this.el('gun').addEventListener('change', () => {
      this.draft.loadout.gun = this.el('gun').checked;
      this.changed();
    });
    this.el('save').addEventListener('click', () => {
      this.saving = true;
      this.notice = '';
      this.el('notice').textContent = '';
      this.send({
        type: 'configure',
        revision: this.snapshot.lobby.revision,
        selection: this.draft,
      });
      this.drawState();
    });
    this.el('ready').addEventListener('click', () => {
      this.awaitReady = !this.own.ready;
      this.awaitReadyRevision = this.snapshot.lobby.revision;
      this.send({ type: 'ready', revision: this.snapshot.lobby.revision, ready: this.awaitReady });
      this.drawState();
    });
    this.el('mission').addEventListener('change', () =>
      this.send({
        type: 'mission',
        revision: this.snapshot.lobby.revision,
        missionId: this.el('mission').value,
      }),
    );
    this.el('start').addEventListener('click', () =>
      this.send({ type: 'start', revision: this.snapshot.lobby.revision }),
    );
    this.el('leave').addEventListener('click', () => this.onLeave?.());
  }
  reset() {
    this.id = null;
    this.rosterKey = null;
    this.draft = null;
    this.dirty = false;
    this.saving = false;
    this.awaitReady = null;
    this.awaitReadyRevision = null;
    this.notice = '';
    this.selectionKey = null;
  }
  option(value, text) {
    const e = this.root.ownerDocument.createElement('option');
    e.value = value;
    e.textContent = text;
    return e;
  }
  changed() {
    this.dirty = true;
    this.drawState();
  }
  refreshLanguage() {
    if (!this.draft || this.root.hidden) return;
    this.drawFields();
    this.update(this.snapshot, this.id);
    this.el('notice').textContent = this.notice ? tr(this.notice) : '';
  }
  reject(message) {
    this.notice = message;
    this.saving = false;
    this.awaitReady = null;
    this.el('notice').textContent = tr(message);
    this.drawState();
  }
  update(snapshot, id) {
    this.snapshot = snapshot;
    if (this.id !== id) {
      this.notice = '';
      this.el('notice').textContent = '';
      this.draft = null;
      this.selectionKey = null;
      this.dirty = false;
      this.saving = false;
      this.awaitReady = null;
    }
    this.id = id;
    const visible = snapshot.mission?.phase === 'waiting';
    this.root.hidden = !visible;
    if (!visible) return;
    const rosterKey = JSON.stringify(snapshot.lobby) + i18n.language + id;
    if (this.rosterKey === rosterKey) return;
    this.rosterKey = rosterKey;
    this.own = snapshot.lobby.players.find((p) => p.id === id);
    const selection = JSON.stringify(this.own.selection);
    if (
      !this.draft ||
      (this.saving && selection === JSON.stringify(this.draft)) ||
      (!this.dirty && this.selectionKey !== selection)
    ) {
      this.draft = structuredClone(this.own.selection);
      this.selectionKey = selection;
      this.dirty = false;
      this.saving = false;
      this.drawFields();
    }
    if (this.awaitReady === this.own.ready || this.awaitReadyRevision !== snapshot.lobby.revision)
      this.awaitReady = null;
    this.el('code').textContent = snapshot.code || this.code;
    this.el('mission').value = snapshot.lobby.missionId;
    const arena = snapshot.scenario === 'arena';
    this.el('mission').hidden = arena;
    this.el('mission-label').hidden = arena;
    this.el('briefing').textContent = tr(
      arena
        ? 'Aréna: minden pilóta ellenfél. Az utolsó túlélő nyer. Nincs pótrepülő.'
        : 'Három közös feladat: csapásmérés, légtérellenőrzés és reptérvédelem. A szobagazda választja ki a bevetést.',
    );
    this.el('role').textContent = tr(
      snapshot.lobby.hostId === id
        ? 'Te vagy a szobagazda.'
        : 'A küldetést a szobagazda választja.',
    );
    const doc = this.root.ownerDocument;
    this.el('roster').replaceChildren(
      ...snapshot.lobby.players.map((p) => {
        const row = doc.createElement('p');
        row.className = p.ready ? 'preflight-ready' : 'preflight-waiting';
        row.textContent =
          p.callSign +
          ' · ' +
          catalogLabel('aircraft', p.selection.aircraftId) +
          ' · ' +
          tr(p.ready ? 'Kész' : 'Felkészülés') +
          ' · ' +
          Math.round(p.selection.fuelFraction * 100) +
          '%' +
          ' · GUN ' +
          (p.selection.loadout.gun ? '✓' : '—') +
          ' · ' +
          ['aam', 'agm', 'bomb']
            .map(
              (t) =>
                t.toUpperCase() + ' ' + p.selection.loadout.stations.filter((v) => v === t).length,
            )
            .join(' / ');
        return row;
      }),
    );
    if (snapshot.lobby.players.length < 2) {
      const wait = doc.createElement('p');
      wait.textContent = tr('A második pilótára várunk. Add át neki a szobakódot.');
      this.el('roster').append(wait);
    }
    this.drawState();
  }
  drawFields() {
    this.el('aircraft').value = this.draft.aircraftId;
    this.el('fuel').value = String(Math.round(this.draft.fuelFraction * 100));
    this.el('gun').checked = this.draft.loadout.gun;
    const spec = aircraft.find((a) => a.id === this.draft.aircraftId),
      doc = this.root.ownerDocument;
    this.el('stations').replaceChildren(
      ...this.draft.loadout.stations.map((value, i) => {
        const label = doc.createElement('label');
        label.textContent = tr('Függesztési pont') + ' ' + (i + 1);
        const select = doc.createElement('select');
        select.append(this.option('', tr('Üres')));
        for (const type of stationOptions(spec, i))
          select.append(this.option(type, tr(weaponLabel({ spec }, type))));
        select.value = value || '';
        select.addEventListener('change', () => {
          this.draft.loadout.stations[i] = select.value || null;
          this.changed();
        });
        label.append(select);
        return label;
      }),
    );
  }
  drawState() {
    if (!this.own) return;
    const locked = this.own.ready || this.awaitReady !== null || this.saving;
    for (const el of this.el('equipment').querySelectorAll('input,select')) el.disabled = locked;
    this.el('mission').disabled = locked || this.snapshot.lobby.hostId !== this.id;
    this.el('save').disabled = locked || !this.dirty || !validateSelection(this.draft);
    this.el('ready').disabled = this.dirty || this.saving || this.awaitReady !== null;
    this.el('ready').textContent = tr(this.own.ready ? 'Mégsem vagyok kész' : 'Kész vagyok');
    const start = this.el('start');
    start.hidden = this.snapshot.lobby.hostId !== this.id;
    start.disabled =
      this.dirty ||
      this.snapshot.lobby.players.length < 2 ||
      !this.snapshot.lobby.players.every((p) => p.ready);
    const valid = validateSelection(this.draft);
    if (valid) {
      const spec = aircraft.find((a) => a.id === this.draft.aircraftId),
        departure = plannedDeparture(spec, this.draft.loadout, {
          fuelFraction: this.draft.fuelFraction,
        });
      this.el('mass').textContent =
        tr('Össztömeg') +
        ': ' +
        Math.round(departure.totalKg) +
        ' kg · ' +
        tr('Üzemanyag') +
        ': ' +
        Math.round(departure.fuel) +
        ' kg';
    } else this.el('mass').textContent = tr('Hibás vagy túl nehéz felszerelés.');
    this.el('unsaved').textContent = tr(
      this.dirty
        ? 'A módosításokat előbb mentsd el.'
        : this.own.ready
          ? 'Indulásra kész. A szobagazda indít.'
          : 'Válassz felszerelést, majd jelezd, ha készen állsz.',
    );
  }
}
