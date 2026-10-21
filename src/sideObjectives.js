import { recoveryComplete } from './navalOps.js';
const row = (id, text, done, optional = false) => ({ id, text, done: !!done, optional });
export function mirroredObjectives(m, s, targets, w) {
  const by = (id) => targets.find((t) => t.id === id),
    dead = (t) => !!t && !t.alive && !t.pending && !t.exited;
  const neutralized = (t) => !!t && !t.alive && !t.pending && (!t.exited || t.retired);
  const opponents = targets.filter((t) => t.team === 'enemy' && t.kind === 'air'),
    allAir = opponents.length > 0 && opponents.every(neutralized),
    home = targets.find((t) => t.home);
  let complete = false,
    failure = '',
    rows = [];
  if (home && !home.alive) failure = 'A saját keleti repülőtér megsemmisült.';
  if (m.spec.naval) {
    complete = dead(by('BASE')) && allAir;
    rows = [
      row('carrier', 'Ellenséges anyahajó megsemmisítve', dead(by('BASE'))),
      row('air', `Nyugati védők: ${opponents.filter(neutralized).length}/4`, allAir),
      row('destroyer', 'Baráti romboló megmaradt', by('ENEMY-DESTROYER')?.alive, true),
      ...targets
        .filter((t) => t.team === 'ally' && t.kind === 'air')
        .map((t) =>
          row(
            'ally-' + t.id,
            `${t.radioCallSign?.flight || 'Rajtárs'} ${t.radioCallSign?.number || ''} túlélte`,
            t.alive,
            true,
          ),
        ),
    ];
  } else if (m.spec.objective === 'defend-base' || m.spec.objective === 'air-superiority') {
    complete = dead(by('BASE')) && (m.spec.objective !== 'air-superiority' || allAir);
    rows = [
      row('base', 'Nyugati reptér megsemmisítve', dead(by('BASE'))),
      row(
        'air',
        `Nyugati gépek: ${opponents.filter(neutralized).length}/${opponents.length}`,
        allAir,
        m.spec.objective !== 'air-superiority',
      ),
      row(
        'sam',
        'Nyugati rakétavédelem leküzdve',
        targets.filter((t) => t.team === 'enemy' && t.type === 'sam-system').every(dead),
        true,
      ),
    ];
  } else if (m.spec.objective === 'escort-transport') {
    const transport = by('TRANSPORT');
    if (transport?.exited) failure = 'A nyugati szállítógép kijutott a légtérből.';
    complete = dead(transport);
    rows = [
      row('transport', 'Ellenséges szállítógép megsemmisítve', complete),
      row(
        'escorts',
        'Vadászkíséret leküzdve',
        opponents.filter((t) => t.type === 'fighter').every(neutralized),
        true,
      ),
    ];
  } else if (m.spec.objective === 'defend-city') {
    const city = targets.filter((t) => t.city),
      destroyed = city.filter(dead).length;
    complete = destroyed > city.length * 0.2;
    rows = [
      row(
        'city',
        `Városi célok megsemmisítve: ${destroyed}/${city.length} · több mint 20% kell`,
        complete,
      ),
      row('defenders', 'Nyugati vadászok leküzdve', allAir, true),
    ];
  } else if (m.spec.objective === 'ballistic-strike') {
    const silo = by('SILO'),
      missile = by('BALLISTIC');
    complete = dead(by('BASE'));
    if (
      !complete &&
      ((!silo?.alive && !silo?.launched) || (missile && !missile.alive && !missile.impacted))
    )
      failure = 'A nyugati támadók elhárították a csapást.';
    rows = [
      row(
        'silo',
        silo?.launched
          ? 'Interkontinentális rakéta elindult'
          : `Indításig ${Math.max(0, Math.ceil((silo?.launchAt || 300) - s.elapsed))} s`,
        silo?.launched,
      ),
      row('impact', 'Nyugati bázis megsemmisítve', complete),
      row('attackers', 'Támadó gépek leküzdve', allAir, true),
    ];
  } else if (m.spec.objective === 'iron-veil') {
    const transport = by('IV-TRANSPORT');
    if (transport?.exited) failure = 'Nomad One kijutott az adatokkal.';
    if (dead(by('IV-COMMAND'))) failure = 'A parancsnoki bunker megsemmisült.';
    complete = dead(transport) && !!by('IV-COMMAND')?.alive;
    rows = [
      row('command', 'Parancsnoki bunker védelme', by('IV-COMMAND')?.alive),
      row(
        'transport',
        transport?.pending ? 'Nomad One érkezésére várunk' : 'Nomad One feltartóztatva',
        dead(transport),
      ),
      row('reinforcement', 'Erősítés átjutott a hídon', by('IV-CONVOY')?.crossedBridge, true),
      row('base', 'Nyugati bázis megsemmisítve', dead(by('BASE')), true),
      row(
        'sam',
        'Legalább egy SAM megmarad',
        ['IV-SAM1', 'IV-SAM2'].some((id) => by(id)?.alive),
        true,
      ),
    ];
  }
  const incoming = w.projectiles?.some(
    (p) => p.owner === 'enemy' && targets.some((t) => t.home && t.id === p.targetEntityId),
  );
  if (incoming) complete = false;
  rows.push(
    row(
      'landing',
      s.recoveryExit
        ? 'Biztonságos kivonulás a KIVONULÁS pontnál'
        : 'Sikeres hazatérés és leszállás',
      complete && recoveryComplete(s),
    ),
  );
  return { rows, complete, failure };
}
