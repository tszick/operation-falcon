import { equipmentLabel } from '../equipmentCatalog.js';
const LIMIT = 64;
const lost = (p) => !!(p.state.dying || p.state.crashed);
// Snapshot history is repeated on the wire. Consume each authoritative event once,
// and keep notifications separate until the shared HUD can display them.
export class MultiplayerNotices {
  constructor() {
    this.reset();
  }
  reset(snapshot = null) {
    this.round = snapshot?.round ?? null;
    this.cursor = snapshot?.combat.eventSequence ?? 0;
    this.players = new Map(
      (snapshot?.players || []).map((p) => [p.id, { connected: p.connected, lost: lost(p) }]),
    );
    this.pending = [];
  }
  push(text, detail = '', level = 'normal') {
    this.pending.push({ text, detail, level, duration: 6 });
    if (this.pending.length > LIMIT) this.pending.shift();
  }
  drain(limit = 8) {
    return this.pending.splice(0, limit);
  }
  receive(snapshot, ownId) {
    if (this.round === null || snapshot.round > this.round) {
      this.reset(snapshot);
      return;
    }
    if (snapshot.round < this.round) return;
    const events =
      snapshot.combat.eventSequence > this.cursor
        ? snapshot.combat.events
            .filter((e) => e.id > this.cursor && ['collision', 'target-hit'].includes(e.type))
            .sort((a, b) => a.time - b.time || a.id - b.id)
        : [];
    const entities = events.length
      ? new Map([
          ...snapshot.combat.targets.map((t) => [t.id, t]),
          ...snapshot.players.map((p) => [p.id, p]),
        ])
      : null;
    const own = snapshot.players.find((p) => p.id === ownId);
    const name = (id) => {
      const entity = entities?.get(id);
      return (
        entity?.callSign ||
        entity?.displayCallSign ||
        (entity && equipmentLabel(entity, { compact: true })) ||
        entity?.name ||
        id ||
        '?'
      );
    };
    const reported = new Set();
    const collisions = new Set(
      events
        .filter((e) => e.id > this.cursor && e.type === 'collision')
        .flatMap((e) => [e.sourceId, e.targetId]),
    );
    if (snapshot.mission?.phase !== 'waiting') {
      for (const event of events) {
        if (event.id <= this.cursor) continue;
        const detail = name(event.sourceId) + ' → ' + name(event.targetId);
        if (event.type === 'collision') {
          this.push('ÜTKÖZÉS', detail, 'warning');
          reported.add(event.sourceId);
          reported.add(event.targetId);
        } else if (event.type === 'target-hit') {
          if (event.weapon === 'collision' && collisions.has(event.targetId)) continue;
          if (event.destroyed) {
            if (reported.has(event.targetId)) continue;
            reported.add(event.targetId);
            const target = entities.get(event.targetId);
            const friendly =
              !!event.friendlyFire ||
              target?.id === ownId ||
              (snapshot.scenario !== 'arena' &&
                (target?.state || target?.team === own?.state.team));
            this.push(
              event.friendlyFire
                ? 'BARÁTI TŰZ — EGYSÉG ELVESZETT'
                : target?.state || target?.kind === 'air'
                  ? 'LELÖVÉS'
                  : 'CÉL MEGSEMMISÍTVE',
              detail,
              friendly ? 'warning' : 'normal',
            );
          } else if (event.friendlyFire) {
            this.push(
              event.sourceId === ownId
                ? 'BARÁTI TŰZ — SAJÁT GÉPET TALÁLTÁL EL!'
                : event.targetId === ownId
                  ? 'BARÁTI TALÁLAT ÉRTE A GÉPED!'
                  : 'BARÁTI TALÁLAT',
              detail,
              'warning',
            );
          }
        }
      }
      for (const p of snapshot.players) {
        const previous = this.players.get(p.id);
        if (previous && !previous.lost && lost(p) && !reported.has(p.id))
          this.push('GÉP ELVESZETT', p.callSign, 'warning');
        if (previous?.connected === true && !p.connected)
          this.push(
            lost(p) ? 'Kapcsolat megszakadt.' : 'AI átvette az irányítást.',
            p.callSign,
            'warning',
          );
        else if (previous?.connected === false && p.connected)
          this.push('Pilóta visszavette az irányítást.', p.callSign);
      }
    }
    this.cursor = Math.max(this.cursor, snapshot.combat.eventSequence, ...events.map((e) => e.id));
    this.players = new Map(
      snapshot.players.map((p) => [p.id, { connected: p.connected, lost: lost(p) }]),
    );
  }
}
