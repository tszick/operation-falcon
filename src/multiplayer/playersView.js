import { tr, i18n } from '../i18n.js';
import { pilotStatus } from './spectator.js';
export class PlayersView {
  constructor(root, observe) {
    this.root = root;
    this.observe = observe;
  }
  update(snapshot, ownId, spectator, ownState) {
    const eligible = spectator.update(snapshot, ownId, ownState);
    const rows = snapshot.players.map((p) => ({
      id: p.id,
      callSign: p.callSign,
      host: snapshot.lobby?.hostId === p.id,
      self: p.id === ownId,
      state: pilotStatus(
        { ...p, ready: snapshot.lobby?.players.find((q) => q.id === p.id)?.ready },
        snapshot.mission?.phase,
      ),
      health: Math.max(0, Math.round(100 - p.state.damage)),
      watch: eligible.some((q) => q.id === p.id),
      selected: spectator.id === p.id,
    }));
    const signature = JSON.stringify(rows) + i18n.language;
    if (signature === this.signature) return;
    this.signature = signature;
    const doc = this.root.ownerDocument,
      list = this.root.querySelector('ul');
    list.replaceChildren(
      ...rows.map((p) => {
        const li = doc.createElement('li'),
          label = doc.createElement('span');
        li.dataset.state =
          p.state === 'Kiesett' ? 'lost' : p.state === 'AI irányítja' ? 'ai' : 'active';
        label.textContent =
          p.callSign +
          (p.self ? ' · ' + tr('Te') : '') +
          (p.host ? ' · ' + tr('Szobagazda') : '') +
          ' — ' +
          tr(p.state) +
          ' · ' +
          p.health +
          '%';
        li.append(label);
        if (p.watch) {
          const button = doc.createElement('button');
          button.type = 'button';
          button.textContent = tr(p.selected ? 'Megfigyelve' : 'Megfigyelés');
          button.setAttribute('aria-pressed', String(p.selected));
          button.addEventListener('click', () => this.observe(p.id));
          li.append(button);
        }
        return li;
      }),
    );
  }
}
