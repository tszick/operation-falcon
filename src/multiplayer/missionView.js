import { tr, i18n } from '../i18n.js';
const labels = {
  base: 'Saját repülőtér megvédése',
  attackers: 'Bombázó és két vadász leküzdése',
  landing: 'Túlélő pilóták leszállása és megállása',
  fighter: 'Ellenséges vadász leküzdése',
  ground: 'Földi céljármű megsemmisítése',
  survival: 'Minden pilóta túlélte (opcionális)',
};
export function missionPresentation(mission) {
  if (!mission) return null;
  const ended = ['success', 'failed'].includes(mission.phase);
  const seconds = Math.floor(mission.elapsed);
  return {
    title:
      mission.assignment === 'arena'
        ? 'Aréna · utolsó túlélő'
        : mission.assignment === 'defend-base'
          ? 'Védd meg a repteret'
          : mission.assignment === 'intercept'
            ? 'Közös légtérellenőrzés'
            : 'Közös csapásmérés',
    phase: mission.phase,
    time: Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'),
    message:
      mission.phase === 'waiting'
        ? 'Várakozás a pilóták készültségére.'
        : mission.phase === 'success'
          ? 'SIKERES KÜLDETÉS'
          : mission.phase === 'failed'
            ? 'SIKERTELEN KÜLDETÉS'
            : mission.assignment === 'arena'
              ? 'Minden másik pilóta ellenfél. Maradj utolsóként a levegőben.'
              : mission.assignment === 'defend-base'
                ? mission.stage === 'return'
                  ? 'Térjetek vissza a bázisra, szálljatok le és álljatok meg. N: leszállási mód · I: segédív.'
                  : 'Védjétek meg a bázist a bombázótól és a két vadásztól.'
                : mission.assignment === 'intercept'
                  ? 'Küzdjétek le a vadászt. A földi cél megsemmisítése opcionális.'
                  : 'Semmisítsétek meg a földi céljárművet, és küzdjétek le a vadászt.',
    objectives: mission.objectives.map((o) => ({
      label:
        o.id === 'ground' && o.optional
          ? 'Földi céljármű megsemmisítése (opcionális)'
          : labels[o.id],
      status: o.status,
    })),
    defense: mission.defense,
    results: ended
      ? mission.participants.map((p) => ({
          id: p.id,
          callSign: p.callSign,
          kills: p.kills,
          returned: p.returned,
          present: p.present,
          eliminatedAt: p.eliminatedAt,
          health: Math.round(p.health),
          hits: p.hits,
          friendlyHits: p.friendlyHits,
          lost: p.lost,
        }))
      : [],
    ended,
  };
}
const renderedResults = new WeakMap();
export function renderRoomMission(root, mission) {
  const signature = JSON.stringify(mission) + i18n.language;
  if (renderedResults.get(root) === signature) return;
  renderedResults.set(root, signature);
  const view = missionPresentation(mission);
  root.hidden = !view;
  if (!view) return;
  const doc = root.ownerDocument;
  const line = (tag, text, className = '') => {
    const node = doc.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
  };
  const heading = line('div', tr(view.title) + ' · ' + view.time, 'network-mission-title');
  const winner = mission.winnerId && mission.participants.find((p) => p.id === mission.winnerId);
  const message = line(
    'p',
    mission.assignment === 'arena' && view.ended
      ? winner
        ? tr('Győztes') + ': ' + winner.callSign
        : tr('Döntetlen')
      : tr(view.message),
    'network-mission-' + view.phase,
  );
  const list = doc.createElement('ul');
  for (const o of view.objectives)
    list.append(
      line(
        'li',
        (o.status === 'complete' ? '✓ ' : o.status === 'failed' ? '× ' : '○ ') + tr(o.label),
        'network-objective-' + o.status,
      ),
    );
  root.replaceChildren(heading, message, list);
  if (view.defense)
    root.append(
      line(
        'p',
        tr('Saját reptér') +
          ': ' +
          view.defense.baseHealth +
          '% · ' +
          tr('Támadók leküzdve') +
          ': ' +
          view.defense.neutralized +
          '/' +
          view.defense.total,
      ),
    );
  if (view.ended) {
    const table = doc.createElement('table'),
      caption = doc.createElement('caption');
    caption.textContent = tr('Pilóták eredményei');
    table.append(caption);
    const header = doc.createElement('tr');
    for (const title of [
      'Pilóta',
      'Állapot',
      'Találatok',
      'Lelövések',
      'Baráti találatok',
      'Gép állapota',
    ]) {
      const th = doc.createElement('th');
      th.scope = 'col';
      th.textContent = tr(title);
      header.append(th);
    }
    const thead = doc.createElement('thead');
    thead.append(header);
    table.append(thead);
    const body = doc.createElement('tbody');
    const results = [...view.results].sort(
      (a, b) =>
        Number(b.id === mission.winnerId) - Number(a.id === mission.winnerId) ||
        (b.eliminatedAt ?? Infinity) - (a.eliminatedAt ?? Infinity) ||
        b.kills - a.kills ||
        b.hits - a.hits ||
        a.callSign.localeCompare(b.callSign),
    );
    for (const p of results) {
      const row = doc.createElement('tr');
      if (p.id === mission.winnerId) row.className = 'network-winner';
      for (const value of [
        p.callSign + (p.present ? '' : ' · AI'),
        tr(p.lost ? 'Kiesett' : p.returned ? 'Leszállt' : 'Túlélte'),
        p.hits,
        p.kills,
        p.friendlyHits,
        p.health + '%',
      ]) {
        const td = doc.createElement('td');
        td.textContent = String(value);
        row.append(td);
      }
      body.append(row);
    }
    table.append(body);
    root.append(table);
    root.append(
      line('p', tr('A szobagazda visszaléphet az előszobába, és ugyanitt indíthat új menetet.')),
    );
  }
}

export function missionFlightNotice(mission, crashed) {
  if (!mission) return null;
  if (mission.phase === 'success' || mission.phase === 'failed')
    return 'A bevetés véget ért. A szobagazda visszaléphet az előszobába.';
  return crashed
    ? 'A géped kiesett. Várd meg a közös eredményt; ezen a bevetésen nincs pótrepülő.'
    : null;
}
