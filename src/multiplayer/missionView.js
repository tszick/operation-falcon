import { tr } from '../i18n.js';
const labels = {
  fighter: 'Ellenséges vadász leküzdése',
  ground: 'Földi céljármű megsemmisítése',
  survival: 'Mindkét pilóta túlélte (opcionális)',
};
export function missionPresentation(mission) {
  if (!mission) return null;
  const ended = ['success', 'failed'].includes(mission.phase);
  const seconds = Math.floor(mission.elapsed);
  return {
    title: mission.assignment === 'intercept' ? 'Közös légtérellenőrzés' : 'Közös csapásmérés',
    phase: mission.phase,
    time: Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'),
    message:
      mission.phase === 'waiting'
        ? 'Várakozás mindkét pilóta készültségére.'
        : mission.phase === 'success'
          ? 'SIKERES KÜLDETÉS'
          : mission.phase === 'failed'
            ? 'SIKERTELEN KÜLDETÉS'
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
    results: ended
      ? mission.participants.map((p) => ({
          callSign: p.callSign,
          health: Math.round(p.health),
          hits: p.hits,
          friendlyHits: p.friendlyHits,
          lost: p.lost,
        }))
      : [],
    ended,
  };
}
export function renderRoomMission(root, mission) {
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
  const message = line('p', tr(view.message), 'network-mission-' + view.phase);
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
  for (const p of view.results)
    root.append(
      line(
        'p',
        p.callSign +
          ' · ' +
          tr(p.lost ? 'Kiesett' : 'Túlélte') +
          ' · ' +
          tr('Gép állapota') +
          ' ' +
          p.health +
          '% · ' +
          tr('Találatok') +
          ' ' +
          p.hits +
          ' · ' +
          tr('Baráti találatok') +
          ' ' +
          p.friendlyHits,
        'network-mission-result',
      ),
    );
  if (view.ended)
    root.append(line('p', tr('Új bevetéshez lépjetek ki, és hozzatok létre új szobát.')));
}

export function missionFlightNotice(mission, crashed) {
  if (!mission) return null;
  if (mission.phase === 'success' || mission.phase === 'failed')
    return 'A bevetés véget ért. Új bevetéshez hozzatok létre új szobát.';
  return crashed
    ? 'A géped kiesett. Várd meg a közös eredményt; ezen a bevetésen nincs pótrepülő.'
    : null;
}
