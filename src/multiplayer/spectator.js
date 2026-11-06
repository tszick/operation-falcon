// Observation never replaces the local aircraft state or its input ownership.
export class Spectator {
  constructor() {
    this.id = null;
  }
  candidates(snapshot, ownId) {
    return snapshot.players.filter((p) => p.id !== ownId && !p.state.dying && !p.state.crashed);
  }
  update(snapshot, ownId, ownState) {
    const available = ownState?.crashed ? this.candidates(snapshot, ownId) : [];
    if (!available.some((p) => p.id === this.id)) this.id = available[0]?.id || null;
    return available;
  }
  choose(id, snapshot, ownId, ownState) {
    if (!ownState?.crashed || !this.candidates(snapshot, ownId).some((p) => p.id === id))
      return false;
    this.id = id;
    return true;
  }
  cycle(direction, snapshot, ownId, ownState) {
    const list = this.update(snapshot, ownId, ownState);
    if (!list.length) return;
    const index = list.findIndex((p) => p.id === this.id);
    this.id = list[(index + direction + list.length) % list.length].id;
  }
  reset() {
    this.id = null;
  }
}
export function pilotStatus(player, phase) {
  if (player.state.crashed) return 'Kiesett';
  if (player.state.dying) return 'Zuhan';
  if (!player.connected) return 'AI irányítja';
  if (phase === 'waiting') return player.ready ? 'Kész' : 'Felkészülés';
  return 'Kapcsolódva';
}
