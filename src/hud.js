import { equipmentLabel } from './equipmentCatalog.js';
import { tr, trHtml } from './i18n.js';
import { tailGunStatus } from './tailGunnery.js';
import { afterburnerStatus } from './engineState.js';
import { updateFlightMessages } from './flightMessages.js';
import { mountCockpit, updateCockpit } from './cockpit.js';
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
const htmlCache = new WeakMap();
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

export function updateHUD(s, targets, weapons, aim, mission, muted, presentation = {}) {
  // Optional local profiler; no timer reads or callback allocation in normal play.
  let measuredAt = presentation.profile ? performance.now() : 0;
  const mark = presentation.profile
    ? (name) => {
        const now = performance.now();
        presentation.profile(name, now - measuredAt);
        measuredAt = now;
      }
    : null;
  mountCockpit();
  const jammed = navigationJammed(s, targets);
  document.body.classList.toggle('navigation-jammed', jammed);
  updateStores(s, weapons, { compact: true, profile: presentation.profile });
  mark?.('stores');
  let configMeasuredAt = presentation.profile ? performance.now() : 0;
  const configMark = presentation.profile
    ? (name) => {
        const now = performance.now();
        presentation.profile('configuration-' + name, now - configMeasuredAt);
        configMeasuredAt = now;
      }
    : null;
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
  for (const [key, indicator] of Object.entries(indicators)) {
    const element = $(ids[key]);
    text(element, shortLabels[key] || labels[key]);
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
  configMark?.('switch-labels');
  const damaged = s.damage >= 15 || s.condition?.engines?.some((v) => v < 0.5),
    damagePanel = $('damage-status'),
    stage = damageStage(s);
  damagePanel.hidden = !damaged || s.dying || s.crashed;
  if (damaged) {
    damagePanel.dataset.stage = stage.id;
    text($('damage-title'), stage.label);
    text($('damage-integrity'), `SZERKEZET ${Math.max(0, Math.round(100 - s.damage))}%`);
    $('damage-bar').style.width = `${Math.max(0, 100 - s.damage)}%`;
    const faults = damageWarnings(s);
    text(
      $('damage-faults'),
      faults.slice(0, 2).join(' · ') || 'SÉRÜLT SZERKEZET · FINOM MANŐVEREK',
    );
    damagePanel.title = tr(faults.join('\n'));
  }
  configMark?.('damage');
  const lock = s.rearView
    ? {
        state: 'rear',
        label: tailGunStatus(s).label,
        hint: 'EGÉR: CÉLZÁS · SZÓKÖZ: TŰZ · V: PILÓTAFÜLKE',
        progress: 0,
      }
    : targetingStatus(s, targets, aim, weapons);
  $('targeting-panel').dataset.state = lock.state;
  text($('lock-label'), lock.label);
  text($('lock-hint'), lock.hint);
  weapons.solution = lock.solution || null;
  text($('weapon-solution'), lock.solution?.detail || '');
  $('weapon-solution').hidden = !lock.solution;
  $('targeting-panel').dataset.solution = lock.solution?.status || '';
  $('lock-fill').style.width = `${lock.progress}%`;
  $('lock-progress').setAttribute('aria-valuenow', String(lock.progress));
  text($('flight-name'), s.spec.name.toUpperCase());
  text($('mission-phase'), mission.phase);
  text($('phase-hint'), mission.phaseHint);
  text($('guide-title'), mission.phase);
  configMark?.('target-status');
  const guideSteps = presentation.guideSteps || phaseGuide(s, mission, aim, weapons, targets);
  fitPhaseGuide(guideSteps, presentation.profile);
  configMark?.('guide-fit');
  mark?.('configuration-and-guide');
  const engine = engineInstruments(s),
    gauge = $('g-load');
  text($('throttle-value'), `${engine.throttle}%`);
  $('throttle-fill').style.height = `${engine.throttle}%`;
  $('throttle-status').setAttribute('aria-valuenow', String(engine.throttle));
  text($('g-value'), `${engine.g >= 0 ? '+' : ''}${engine.g.toFixed(1)}`);
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
  text(
    $('fuel-label'),
    {
      normal: 'FUEL TOT',
      low: 'BINGO',
      critical: 'FUEL LOW',
      empty: 'FUEL OUT',
    }[fuelInfo.level],
  );
  text($('fuel-quantity'), `${fuelInfo.kg.toLocaleString('hu-HU')} KG`);
  $('fuel-quantity').title = tr(`${fuelInfo.kg} kg üzemanyag`);
  text($('fuel-range'), fuelInfo.rangeKm === null ? '— KM' : `~${Math.round(fuelInfo.rangeKm)} KM`);
  $('fuel-range').title = tr(
    'Becslés a pillanatnyi vízszintes sebességgel és fogyasztással, tartalék nélkül. Nem optimális elméleti hatótáv; a szél és a siklás nincs benne.',
  );
  text($('fuel-value'), `${fuelInfo.percent}%`);
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
  text($('warning'), s.dying || s.crashed ? s.warning : s.threatWarning || s.warning);
  text(
    $('flight-status'),
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
  const targetDescription = jammed
    ? 'JELZAVARÁS · NAVIGÁCIÓ NEM ELÉRHETŐ'
    : mission.spec.objective === 'landing'
      ? 'LESZÁLLÁSI GYAKORLAT · BASE'
      : selected?.visible
        ? `${equipmentLabel(selected.target, { compact: true }).toUpperCase()} · ${(selected.distance / 1000).toFixed(1)} KM · ${aim.locked ? 'BEFOGVA' : lock.state === 'acquiring' ? 'BEFOGÁS' : 'KIJELÖLVE'}`
        : mission.spec.objective === 'escort' && mission.objectiveComplete
          ? 'CIVIL TÁVOZOTT · RTB'
          : mission.civilIntercepted
            ? 'CIVIL VISSZAFORDUL · TŰZTILALOM'
            : mission.destroyed
              ? 'CÉL MEGSEMMISÍTVE · RTB'
              : `${contacts.filter((c) => c.visible && c.selectable).length} CÉL · ${contacts.filter((c) => c.visible && c.target.team === 'ally' && !c.target.home && !c.target.city).length} SZÖVETSÉGES · TAB: VÁLTÁS`;
  $('target-data').dataset.lock =
    jammed || !selected?.visible
      ? 'idle'
      : aim.locked
        ? 'locked'
        : lock.state === 'acquiring'
          ? 'acquiring'
          : 'idle';
  $('target-data').title = tr(targetDescription);
  text(
    $('target-data'),
    selected?.visible
      ? targetDescription
      : jammed
        ? 'JELZAVARÁS'
        : mission.spec.objective === 'landing'
          ? 'BASE / N'
          : `${contacts.filter((c) => c.visible && c.selectable).length} CÉL · ${contacts.filter((c) => c.visible && c.target.team === 'ally' && !c.target.home && !c.target.city).length} BARÁT`,
  );
  mark?.('gauges-and-contacts');
  // Size the cockpit once after text updates, before drawing the radar.
  updateCockpit(s);
  mark?.('cockpit-layout');
  const map = renderTacticalMap($('radar'), s, targets, aim);
  mark?.('radar');
  text(
    $('map-range'),
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
    const refuelling = !!s.aerialRefuel && !s.crashed && !s.dying && !jammed,
      enabled = refuelling ? !!s.refuellingRouteEnabled : s.landingRouteEnabled !== false;
    routeButton.hidden = !landing && !refuelling;
    routeButton.title = tr(
      refuelling ? 'I: tankolási segédív ki/be' : 'I: leszállási segédív ki/be',
    );
    routeButton.setAttribute('aria-pressed', String(enabled));
    text(routeButton, `I SEGÉDÍV ${enabled ? 'BE' : 'KI'}`);
  }
  if (landing) {
    text($('approach-stage'), `${approach.stage} · ${(approach.distance / 1000).toFixed(1)} KM`);
    html(
      $('approach-checks'),
      approach.items
        .filter(
          (item) =>
            ![
              'FUTÓMŰ',
              'FÉKSZÁRNY',
              'LÉGFÉK',
              'BEDÖNTÉS',
              'ORRHELYZET',
              'PÁLYAIRÁNY',
              'BEÉRKEZÉS',
            ].includes(item.label),
        )
        .map(
          (item) =>
            `<div class="${item.ok ? 'check-ok' : 'check-warn'}" title="${item.label}"><span>${item.ok ? '✓' : '!'} ${{ SEBESSÉG: 'IAS', SÜLLYEDÉS: 'V/S', SIKLÓPÁLYA: 'SIKLÁS' }[item.label] || item.label}</span><b>${item.value}</b></div>`,
        )
        .join(''),
    );
    text(
      $('approach-instruction'),
      approach.instruction + (map.landingRoute?.advisory ? ' ' + map.landingRoute.advisory : ''),
    );
  }
  mark?.('landing-and-objectives');
  updateFlightMessages(s, lock, aim, weapons);
  mark?.('messages');
}

// Keep a small, current checklist; CSS lays out ordinary text without measuring glyphs.
function fitPhaseGuide(steps) {
  const list = $('guide-steps');
  html(
    list,
    steps
      .filter((item) => !item.done)
      .slice(0, 2)
      .map(
        (item) =>
          `<li class="${item.active ? 'current' : ''}"><kbd>${item.key}</kbd><span>${item.text}</span></li>`,
      )
      .join(''),
  );
}
export function renderMissionSummary(s, mission, targets) {
  const card = missionCardState(s, mission, targets);
  text($('mission-card-name'), card.name);
  text($('mission-time'), card.elapsed);
  html($('mission-objectives'), missionGoalsMarkup(card));
}
