import { tr, trHtml } from './i18n.js';
import { ironVeilVisibleRows } from './ironVeil.js';
import { tailGunStatus } from './tailGunnery.js';
import { afterburnerStatus } from './engineState.js';
import { updateFlightMessages } from './flightMessages.js';
import { mountCockpit, updateCockpit } from './cockpit.js';
import { compactObjective } from './cockpitGeometry.js';
import { missionCardState, missionGoalsMarkup, configurationIndicators } from './flightPanels.js';
import { navigationJammed } from './electronicWarfare.js';
import { radarContacts, targetingStatus } from './targeting.js';
import { fuelStatus, engineInstruments } from './instruments.js';
import { phaseGuide } from './phaseGuide.js';
import { updateStores } from './storesDisplay.js';
import { damageStage, damageWarnings } from './damage.js';
import { renderTacticalMap } from './tacticalMap.js';
import { landingAttitudeMarkup } from './landingAttitude.js';
import { flapStatus } from './flaps.js';
const $ = (id) => document.getElementById(id);
const htmlCache = new WeakMap(),
  controlFit = new WeakMap();
const text = (element, value) => {
  value = tr(value);
  if (element.textContent !== value) element.textContent = value;
};
const html = (element, value) => {
  if (htmlCache.get(element) !== value) {
    element.innerHTML = trHtml(value);
    htmlCache.set(element, value);
  }
};

export function updateHUD(s, targets, weapons, aim, mission, muted) {
  mountCockpit();
  const jammed = navigationJammed(s, targets);
  document.body.classList.toggle('navigation-jammed', jammed);
  updateCockpit(s);
  updateStores(s, weapons, { compact: true });
  const flap = flapStatus(s),
    cm = s.countermeasures;
  const indicators = configurationIndicators(s),
    labels = {
      gear: 'G · FUTÓMŰ',
      flaps: 'X · FÉKSZÁRNY',
      airbrake: 'B · LÉGFÉK',
      engine: `GÁZ ${Math.round(s.throttle * 100)}%`,
      afterburner: 'SHIFT · AB',
      assist: 'L · G-LIMIT',
      wheelBrake: 'CTRL · KERÉKFÉK',
    },
    ids = {
      gear: 'config-gear',
      flaps: 'config-flaps',
      airbrake: 'config-airbrake',
      engine: 'config-engine',
      afterburner: 'config-afterburner',
      assist: 'config-assist',
      wheelBrake: 'config-wheel-brake',
    };
  const shortLabels = {
    gear: 'FUTÓ',
    flaps: 'FÉKSZ.',
    airbrake: 'LÉGFÉK',
    afterburner: s.spec.vtol ? 'FÚVÓ ' + (s.naval?.nozzle || 0) + '°' : afterburnerStatus(s).label,
    assist: 'G-LIM',
    wheelBrake: 'KERÉKFÉK',
  };
  if (s.naval && !s.spec.vtol) {
    shortLabels.assist = 'HOROG';
    labels.assist = 'K · FÉKEZŐHOROG';
    indicators.assist = {
      active: !!s.naval.hook,
      state: s.approach?.active && !s.naval.hook ? 'danger' : s.naval.hook ? 'active' : 'off',
    };
  }
  // Read changed control dimensions together before any label/style writes.
  const controls = Object.entries(indicators).map(([key, indicator]) => {
    const element = $(ids[key]),
      label = shortLabels[key] || labels[key],
      fitKey = `${innerWidth}:${innerHeight}:${label}`,
      fit = element.tagName === 'BUTTON' && controlFit.get(element) !== fitKey;
    return { key, indicator, element, label, fitKey, width: fit ? element.clientWidth : 0 };
  });
  for (const { key, indicator, element, label, fitKey, width } of controls) {
    text(element, label);
    if (width > 0) {
      element.style.fontSize = `${Math.max(7, Math.min(innerWidth <= 1050 ? 9 : 10, (width - 2) / (label.length * 0.62)))}px`;
      controlFit.set(element, fitKey);
    }
    if (element.dataset.state !== indicator.state) element.dataset.state = indicator.state;
    element.setAttribute(
      'aria-label',
      tr(
        `${labels[key]} · ${indicator.active ? 'aktív' : 'inaktív'}${indicator.state === 'danger' ? ' · veszélyes állás' : ''}`,
      ),
    );
    if (element.tagName === 'BUTTON')
      element.setAttribute('aria-pressed', String(indicator.active));
  }
  $('config-afterburner').hidden = !s.spec.hasAB && !s.spec.vtol;
  if (s.spec.vtol) $('config-afterburner').dataset.state = s.naval?.nozzle ? 'active' : 'off';
  $('config-afterburner').title = tr(
    s.spec.vtol ? 'Z: fúvócső 0° / 45° / 90°' : afterburnerStatus(s).message,
  );
  if (s.spec.vtol)
    $('config-afterburner').setAttribute('aria-pressed', String((s.naval?.nozzle || 0) > 0));
  $('config-assist').title = tr(
    s.naval && !s.spec.vtol ? 'K: fékezőhorog ki/be' : 'L: terheléskorlátozás',
  );
  $('config-afterburner').setAttribute(
    'aria-label',
    tr(
      s.spec.vtol
        ? 'Z · fúvócső ' + (s.naval?.nozzle || 0) + ' fok'
        : 'SHIFT · ' + afterburnerStatus(s).message,
    ),
  );
  $('config-flaps').dataset.moving = String(flap.moving);
  $('config-flaps').title = tr(flap.label);
  text($('config-countermeasures'), `C · IR ${cm?.flare || 0} / R ${cm?.chaff || 0}`);
  const damaged = s.damage >= 15 || s.condition?.engines?.some((v) => v < 0.5),
    damagePanel = $('damage-status'),
    stage = damageStage(s);
  damagePanel.hidden = !damaged || s.dying || s.crashed;
  if (damaged) {
    damagePanel.dataset.stage = stage.id;
    $('damage-title').textContent = tr(stage.label);
    $('damage-integrity').textContent = tr(`SZERKEZET ${Math.max(0, Math.round(100 - s.damage))}%`);
    $('damage-bar').style.width = `${Math.max(0, 100 - s.damage)}%`;
    const faults = damageWarnings(s);
    $('damage-faults').textContent = tr(
      faults.slice(0, 2).join(' · ') || 'SÉRÜLT SZERKEZET · FINOM MANŐVEREK',
    );
    damagePanel.title = tr(faults.join('\n'));
  }
  const lock = s.rearView
    ? {
        state: 'rear',
        label: tailGunStatus(s).label,
        hint: 'EGÉR: CÉLZÁS · SZÓKÖZ: TŰZ · V: PILÓTAFÜLKE',
        progress: 0,
      }
    : targetingStatus(s, targets, aim, weapons);
  $('targeting-panel').dataset.state = lock.state;
  $('lock-label').textContent = tr(lock.label);
  $('lock-hint').textContent = tr(lock.hint);
  weapons.solution = lock.solution || null;
  $('weapon-solution').textContent = tr(lock.solution?.detail || '');
  $('weapon-solution').hidden = !lock.solution;
  $('targeting-panel').dataset.solution = lock.solution?.status || '';
  $('lock-fill').style.width = `${lock.progress}%`;
  $('lock-progress').setAttribute('aria-valuenow', String(lock.progress));
  $('flight-name').textContent = tr(s.spec.name.toUpperCase());
  $('mission-phase').textContent = tr(mission.phase);
  $('phase-hint').textContent = tr(mission.phaseHint);
  $('guide-title').textContent = tr(mission.phase);
  const card = missionCardState(s, mission, targets);
  $('mission-card').dataset.operation = mission.spec.objective;
  $('mission-card-name').textContent = tr(card.name);
  $('mission-time').textContent = tr(card.elapsed);
  $('mission-time').title = tr('Eltelt küldetésidő');
  $('mission-card-phase').textContent = tr(card.phase);
  $('mission-priority').hidden = true;
  $('mission-priority').textContent = tr(card.priority);
  html(
    $('mission-objectives'),
    missionGoalsMarkup({
      ...card,
      rows: (mission.spec.objective === 'iron-veil'
        ? ironVeilVisibleRows(mission, card.rows)
        : card.rows
      ).map((row) => ({ ...row, text: compactObjective(row), fullText: row.text })),
    }),
  );
  $('mission-card').title = tr(card.name + ' · ' + card.phase);
  const guideSteps = phaseGuide(s, mission, aim, weapons, targets);
  fitPhaseGuide(guideSteps);
  const engine = engineInstruments(s),
    gauge = $('g-load');
  $('throttle-value').textContent = tr(`${engine.throttle}%`);
  $('throttle-fill').style.height = `${engine.throttle}%`;
  $('throttle-status').setAttribute('aria-valuenow', String(engine.throttle));
  $('g-value').textContent = tr(`${engine.g >= 0 ? '+' : ''}${engine.g.toFixed(1)}`);
  gauge.dataset.level = engine.level;
  gauge.setAttribute('aria-valuemin', String(engine.limits.negative));
  gauge.setAttribute('aria-valuemax', String(engine.limits.positive));
  gauge.setAttribute('aria-valuenow', String(engine.g));
  gauge.setAttribute(
    'aria-valuetext',
    `${engine.g.toFixed(1)} G · ${{ normal: 'rendben', warning: 'figyelmeztetés', danger: 'veszélyes terhelés' }[engine.level]}`,
  );
  gauge.title = tr(
    `G-terhelés · szerkezeti határok: ${engine.limits.negative.toFixed(1)} / +${engine.limits.positive.toFixed(1)} G · sárga a határ 80%-ától`,
  );
  const fuelInfo = fuelStatus(s);
  $('fuel-status').dataset.level = fuelInfo.level;
  $('fuel-status').title = tr(
    `Fogyasztás: ${Math.round(fuelInfo.flowKgMin)} kg/perc${fuelInfo.minutesRemaining !== null ? ` · ezen a gázálláson kb. ${fuelInfo.minutesRemaining.toFixed(1)} perc marad` : ''}`,
  );
  $('fuel-label').textContent = tr(
    {
      normal: 'FUEL TOT',
      low: 'BINGO',
      critical: 'FUEL LOW',
      empty: 'FUEL OUT',
    }[fuelInfo.level],
  );
  $('fuel-quantity').textContent = tr(`${fuelInfo.kg.toLocaleString('hu-HU')} KG`);
  $('fuel-quantity').title = tr(`${fuelInfo.kg} kg üzemanyag`);
  $('fuel-range').textContent = tr(
    fuelInfo.rangeKm === null ? '— KM' : `~${Math.round(fuelInfo.rangeKm)} KM`,
  );
  $('fuel-range').title = tr(
    'Becslés a pillanatnyi vízszintes sebességgel és fogyasztással, tartalék nélkül. Nem optimális elméleti hatótáv; a szél és a siklás nincs benne.',
  );
  $('fuel-value').textContent = tr(`${fuelInfo.percent}%`);
  $('fuel-fill').style.width = String(fuelInfo.percent) + '%';
  $('fuel-gauge').setAttribute(
    'aria-label',
    tr(
      `${fuelInfo.percent}% üzemanyag, ${fuelInfo.kg} kg; ${fuelInfo.rangeKm === null ? 'hatótáv még nem becsülhető' : `becsült hatótáv ${Math.round(fuelInfo.rangeKm)} km`}`,
    ),
  );
  $('fuel-meter').setAttribute('aria-valuenow', String(fuelInfo.percent));
  $('fuel-meter').setAttribute(
    'aria-valuetext',
    `${fuelInfo.percent} százalék, ${fuelInfo.kg} kilogramm. ${fuelInfo.label}`,
  );
  $('warning').textContent = tr(s.dying || s.crashed ? s.warning : s.threatWarning || s.warning);
  $('flight-status').textContent = tr(
    `${s.assist ? 'G-LIMITER BE' : 'G-LIMITER KI'} · ${s.onGround ? 'FÖLDÖN' : 'REPÜLÉS'} · ${Math.floor(
      s.elapsed / 60,
    )
      .toString()
      .padStart(2, '0')}:${Math.floor(s.elapsed % 60)
      .toString()
      .padStart(2, '0')} · ${muted ? 'NÉMÍTVA' : 'HANG BE'}`,
  );
  const contacts = radarContacts(s, targets),
    selected = contacts.find((x) => x.target.id === aim.id);
  $('target-data').textContent = tr(
    jammed
      ? 'JELZAVARÁS · NAVIGÁCIÓ NEM ELÉRHETŐ'
      : mission.spec.objective === 'landing'
        ? 'LESZÁLLÁSI GYAKORLAT · BASE'
        : selected?.visible
          ? `${selected.target.name.toUpperCase()} · ${(selected.distance / 1000).toFixed(1)} KM · ${aim.locked ? 'BEFOGVA' : lock.state === 'acquiring' ? 'BEFOGÁS' : 'KIJELÖLVE'}`
          : mission.spec.objective === 'escort' && mission.objectiveComplete
            ? 'CIVIL TÁVOZOTT · RTB'
            : mission.civilIntercepted
              ? 'CIVIL VISSZAFORDUL · TŰZTILALOM'
              : mission.destroyed
                ? 'CÉL MEGSEMMISÍTVE · RTB'
                : `${contacts.filter((c) => c.visible && c.selectable).length} CÉL · ${contacts.filter((c) => c.visible && c.target.team === 'ally' && !c.target.home && !c.target.city).length} SZÖVETSÉGES · TAB: VÁLTÁS`,
  );
  $('target-data').dataset.lock =
    jammed || !selected?.visible
      ? 'idle'
      : aim.locked
        ? 'locked'
        : lock.state === 'acquiring'
          ? 'acquiring'
          : 'idle';
  $('target-data').title = tr($('target-data').textContent);
  if (!selected?.visible)
    $('target-data').textContent = tr(
      jammed
        ? 'JELZAVARÁS'
        : mission.spec.objective === 'landing'
          ? 'BASE / N'
          : `${contacts.filter((c) => c.visible && c.selectable).length} CÉL · ${contacts.filter((c) => c.visible && c.target.team === 'ally' && !c.target.home && !c.target.city).length} BARÁT`,
    );
  const map = renderTacticalMap($('radar'), s, targets, aim);
  $('map-range').textContent = tr(
    jammed ? 'NINCS JEL' : `${(map.halfExtent * 2) / 1000} KM · ${map.zoomFactor}×`,
  );
  const approach = s.approach,
    landing = !!approach?.active && !s.onGround && !s.crashed && !jammed;
  const wasLanding = document.body.classList.contains('approaching');
  document.body.classList.toggle('approaching', landing);
  if (landing !== wasLanding) $('weapon-bay').open = !landing;
  $('landing-guidance').hidden = !landing;
  $('landing-attitude').hidden = !landing;
  if (landing) html($('landing-attitude'), landingAttitudeMarkup(s));
  $('approach-button').setAttribute('aria-pressed', String(landing));
  const routeButton = $('landing-route-button');
  if (routeButton) {
    routeButton.hidden = !landing;
    routeButton.setAttribute('aria-pressed', String(s.landingRouteEnabled !== false));
    routeButton.textContent = tr(`I SEGÉDÍV ${s.landingRouteEnabled === false ? 'KI' : 'BE'}`);
  }
  const head = $('head-view-status');
  if (head) {
    const yaw = s.headLook?.yawDeg || 0,
      pitch = s.headLook?.pitchDeg || 0;
    head.hidden = Math.abs(yaw) + Math.abs(pitch) < 2;
    head.textContent = tr(
      `NÉZET ${yaw < 0 ? 'BAL' : 'JOBB'} ${Math.abs(yaw).toFixed(0)}° · ${pitch < 0 ? 'LE' : 'FEL'} ${Math.abs(pitch).toFixed(0)}°`,
    );
  }
  if (landing) {
    $('approach-stage').textContent = tr(
      `${approach.stage} · ${(approach.distance / 1000).toFixed(1)} KM`,
    );
    html(
      $('approach-checks'),
      approach.items
        .filter(
          (item) =>
            !['FUTÓMŰ', 'FÉKSZÁRNY', 'LÉGFÉK', 'BEDÖNTÉS', 'ORRHELYZET', 'PÁLYAIRÁNY'].includes(
              item.label,
            ),
        )
        .map(
          (item) =>
            `<div class="${item.ok ? 'check-ok' : 'check-warn'}" title="${item.label}"><span>${item.ok ? '✓' : '!'} ${{ SEBESSÉG: 'IAS', SÜLLYEDÉS: 'V/S', SIKLÓPÁLYA: 'SIKLÁS', BEÉRKEZÉS: 'SZÖG' }[item.label] || item.label}</span><b>${item.value}</b></div>`,
        )
        .join(''),
    );
    $('approach-instruction').textContent = tr(
      approach.instruction + (map.landingRoute?.advisory ? ' ' + map.landingRoute.advisory : ''),
    );
  }
  updateCockpit(s);
  fitMissionObjectives();
  updateFlightMessages(s, lock, aim, weapons);
}

// Measure the untransformed screen: completed steps no longer consume glass space.
const guideLayout = new WeakMap();
function fitPhaseGuide(steps) {
  const list = $('guide-steps'),
    pending = steps.filter((item) => !item.done);
  const html = pending
    .map(
      (item) =>
        `<li class="${item.active ? 'current' : ''}"><kbd>${item.key}</kbd><span>${item.text}</span></li>`,
    )
    .join('');
  const key = html + ':' + innerWidth + ':' + innerHeight + ':' + document.body.className;
  if (guideLayout.get(list) === key) return;
  const height = list.clientHeight;
  guideLayout.set(list, key);
  list.innerHTML = trHtml(html);
  list.style.setProperty('--guide-lines', height >= 24 ? 2 : 1);
  let full = false;
  for (const row of list.children) {
    full = full || row.offsetTop + row.offsetHeight > height;
    row.hidden = full;
  }
}

const missionLayouts = new WeakMap();
function fitMissionObjectives() {
  const card = $('mission-card'),
    list = $('mission-objectives');
  const key = list.innerHTML + ':' + list.clientWidth + ':' + list.clientHeight;
  if (missionLayouts.get(list) === key) return;
  card.classList.remove('dense-objectives');
  if (list.scrollHeight > list.clientHeight + 1) card.classList.add('dense-objectives');
  missionLayouts.set(list, key);
}
