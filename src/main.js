import { tr, trHtml, formatNumber } from './i18n.js';
import { missionForSide } from './missionSides.js';
import { Briefing } from './ui/briefing.js';
import { catalogueAircraft } from './aircraftCatalog.js';
import { aircraftSide } from './aircraftNations.js';
import { missionLocation } from './missionLocations.js';
import { weaponProfile } from './weaponDynamics.js';
import { readPreference, writePreference } from './ui/preferences.js';
import { requestCatapult } from './navalOps.js';
import { surfaceStyles, missionSurface } from './surfaceStyle.js';
import { missionForAircraft } from './transportRole.js';
import { isPracticeMission, unarmedPractice } from './trainingAircraft.js';
import { MissionControlView } from './missionControl.js';
import { nextMapZoom } from './tacticalMap.js';
import { hasTailGun, setRearView } from './tailGunnery.js';
import { afterburnerStatus } from './engineState.js';
import { FrameTelemetry } from './frameTelemetry.js';
import { superiorityRoster } from './airSuperiority.js';
import { HeadLookInput } from './headLookInput.js';
import { postRadioMessage, postFlightMessage, resetFlightMessages } from './flightMessages.js';
import { mountCockpit } from './cockpit.js';
import { debriefMarkup } from './flightDebrief.js';
import {
  defaultLoadout,
  stationOptions,
  validateLoadout,
  configureAircraft,
  initialWeapon,
  plannedDeparture,
} from './loadoutPlanner.js';
import { HeadLook } from './headLook.js';
import { clearLandingRoute } from './landingRoute.js';
import { FlightRecorder } from './flightRecorder.js';
import { FlightLogStorage, downloadFlightLog } from './flightLogStorage.js';
import { unitDefinition } from './unitTypes.js';
import { navigationJammed } from './electronicWarfare.js';
import { aircraft, missions, suitability } from './aircraftSpec.js';
import { stepAircraft, STEP } from './physics.js';
import { createMissionAircraft, defaultMissionFuel } from './missionStart.js';
import { createTargets, updateTargets, Targeting } from './targeting.js';
import { Weapons } from './weapons.js';
import { Mission } from './mission.js';
import { AudioSystem } from './audio.js';
import { Renderer, renderTargetPreview } from './renderer.js';
import { updateHUD } from './hud.js';
import { evaluateApproach } from './landing.js';
import { armament, weaponLabel } from './armament.js';
import { toggleActuator, advanceCrashSequence } from './damage.js';
import { threatMarkup, missionThreatsFor, threatTypes } from './threats.js';
import { deployCountermeasures } from './countermeasures.js';
mountCockpit();
const $ = (id) => document.getElementById(id),
  renderer = new Renderer($('world')),
  audio = new AudioSystem(),
  keys = new Set();
function setSurfaceMode(mode) {
  renderer.surfaceMode = surfaceStyles[mode] ? mode : 'grass';
  renderer.surfaceLines = renderer.surfaceMode === 'vector';
}
setSurfaceMode('grass');
audio.radio.onLine = (line, now) => {
  postRadioMessage(line, now);
  recorder.event('radio', {
    id: line.id,
    group: line.group,
    speaker: line.speaker,
    text: line.text,
    callSign: line.callSign,
    duration: line.duration,
  });
};
let pointerWheelBrake = false,
  pointerEscapeAt = -Infinity;
const headLook = new HeadLook();
renderer.headLook = headLook;
let landingRouteEnabled = readPreference('falcon-landing-route') !== 'off';
let guideVisible = readPreference('vector-flight-guide') !== 'closed';
let selected = aircraft.find((a) => a.id === 'f16'),
  selectedMission = missions[0],
  selectedSide = 'west',
  state = null,
  targets = [],
  weapons = null,
  aim = null,
  mission = null,
  playing = false,
  paused = false,
  accumulator = 0,
  last = performance.now(),
  uiElapsed = 0,
  reported = false,
  best = 0;
const headInput = new HeadLookInput($('world'), headLook, document, {
  canLook: () => playing && !paused && !state?.dying && !state?.crashed && !renderer.thirdPerson,
  onEscape: () => {
    pointerEscapeAt = performance.now();
    if (playing && !paused && !state?.dying && !state?.crashed) showOverlay('pause');
  },
  onChange: (locked) => document.body.classList.toggle('mouse-look-locked', locked),
});
best = Number(readPreference('vector-flight-best')) || 0;
const logStorage = new FlightLogStorage((error) => {
  $('log-storage-status').textContent = tr('Csak memóriában: ' + error.message);
});
const recorder = new FlightRecorder({
  onReset: (metadata) => {
    logStorage.reset(metadata);
    $('log-storage-status').textContent = tr('Csak az aktuális küldetés');
  },
  onBatch: (metadata, entries) => logStorage.append(metadata, entries),
});
const frameTelemetry = new FrameTelemetry();
const controlView = new MissionControlView();
let controlPauseOwned = false;
function cycleMapZoom() {
  if (!state) return;
  if (!controlView.root.hidden) {
    controlView.zoom = nextMapZoom(controlView.zoom);
    controlView.draw();
    recorder.event('mission-control-zoom', { level: controlView.zoom });
    return;
  }
  state.mapZoom = nextMapZoom(state.mapZoom);
  updateHUD(state, targets, weapons, aim, mission, audio.muted);
}
function toggleMissionControl() {
  if (!controlView.root.hidden) {
    controlView.hide();
    recorder.event('mission-control', { open: false });
    if (controlPauseOwned) resume();
    else {
      $('overlay').hidden = false;
      $('resume').focus();
    }
    return;
  }
  if (
    !playing ||
    state.dying ||
    state.crashed ||
    mission.complete ||
    mission.failed ||
    mission.recovered
  )
    return;
  controlPauseOwned = !paused;
  if (!paused) showOverlay('pause');
  $('overlay').hidden = true;
  $('help').hidden = true;
  pointerWheelBrake = false;
  keys.clear();
  controlView.show(state, mission, targets, aim);
  recorder.event('mission-control', { open: true });
  $('close-mission-control').focus();
}
addEventListener('resize', () => controlView.draw());
function logFramePerformance(report) {
  if (!report) return;
  const allies = targets.filter((t) => t.team === 'ally' && t.kind === 'air' && t.alive),
    near = allies.sort(
      (a, b) => a.position.distance(state.position) - b.position.distance(state.position),
    )[0];
  recorder.event('performance', {
    ...report,
    visualStyle: renderer.surfaceMode,
    view: state.dying || state.crashed ? 'wreck' : state.rearView ? 'tail-gunner' : 'cockpit',
    modelBackend: renderer.gpuModels && !renderer.gpuModels.lost ? 'WebGL2' : 'Canvas2D',
    featureBackend:
      renderer.gpuModels?.featurePainter &&
      !renderer.gpuModels.featuresUnavailable &&
      !renderer.gpuModels.lost
        ? 'WebGL2'
        : 'Canvas2D',
    terrainBackend:
      renderer.gpuModels && !renderer.gpuModels.lost && !renderer.gpuModels.terrainUnavailable
        ? 'WebGL2'
        : 'Canvas2D',
    viewport: [renderer.w, renderer.h],
    pixelRatio: renderer.canvas.width / renderer.w,
    aircraft: targets.filter((t) => t.kind === 'air' && (t.alive || t.falling)).length,
    falling: targets.filter((t) => t.falling).length,
    smokePuffs: targets.reduce(
      (n, t) => n + (t.flight?.condition.smoke.length || 0),
      state.condition.smoke.length,
    ),
    projectiles: weapons.projectiles.length,
    trails: weapons.trails.length,
    effects: weapons.effects.length,
    nearestAlly: near
      ? {
          id: near.id,
          callSign: near.radioCallSign,
          distanceM: Math.round(near.position.distance(state.position)),
        }
      : null,
  });
}
function exportFlight() {
  if (!recorder.metadata) return;
  recorder.flush();
  downloadFlightLog(recorder.export());
}
$('export-flight-log').onclick = exportFlight;
const ratingLabels = { good: 'AJÁNLOTT', ok: 'HASZNÁLHATÓ', bad: 'NEM AJÁNLOTT' };
const loadoutChoices = new Map(),
  fuelChoices = new Map();
const fuelKey = () => `${selected.id}:${unarmedPractice(selectedMission) ? 'landing' : 'standard'}`;
function selectedFuel() {
  return fuelChoices.get(fuelKey()) ?? defaultMissionFuel(selectedMission, selected);
}
const kg = (value) => formatNumber(value, { maximumFractionDigits: 1 });
function updateDeparture() {
  const training = unarmedPractice(selectedMission),
    fraction = selectedFuel(),
    plan = plannedDeparture(selected, selectedLoadout(), {
      fuelFraction: fraction,
      unarmed: training,
    }),
    full = plannedDeparture(selected, defaultLoadout(selected), { unarmed: training });
  $('start-fuel').value = Math.round(fraction * 100);
  $('start-fuel-value').textContent = tr(
    `${Math.round(fraction * 100)}% · ${kg(plan.fuelKg)} / ${kg(selected.fuelCapacity)} kg`,
  );
  $('departure-mass').innerHTML = trHtml(
    [
      ['Üres gép', plan.emptyKg],
      ['Üzemanyag', plan.fuelKg],
      ['Rakéták', plan.missilesKg],
      ['Bombák', plan.bombsKg],
      ['Gépágyúlőszer (becsült)', plan.gunAmmoKg],
      ...(selected.defensiveGun ? [['Farokgépágyú-lőszer (becsült)', plan.tailGunAmmoKg]] : []),
    ]
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${kg(value)} kg</dd></div>`)
      .join(''),
  );
  $('departure-total').textContent = tr(`${kg(plan.totalKg)} kg`);
  const difference = plan.totalKg - full.totalKg;
  $('departure-delta').textContent = tr(
    Math.abs(difference) < 0.05
      ? 'Teljes tank és alapfeltöltés.'
      : `${kg(Math.abs(difference))} kg-mal ${difference < 0 ? 'könnyebb' : 'nehezebb'} a teljes tankkal${training ? '' : ' és alapfegyverzettel'} induló gépnél.`,
  );
  $('departure-warning').textContent = tr(
    fraction === 0
      ? 'Üres tank: a hajtómű nem ad tolóerőt.'
      : fraction < 0.1
        ? 'Kevés üzemanyag: a hazatéréshez is hagyj tartalékot.'
        : '',
  );
  if (training)
    $('planner-stores').textContent = tr(
      `FEGYVERZET NÉLKÜL · ${Math.round(fraction * 100)}% ÜZEMANYAG`,
    );
}
$('start-fuel').addEventListener('input', () => {
  fuelChoices.set(fuelKey(), Number($('start-fuel').value) / 100);
  updateDeparture();
});
function selectedLoadout() {
  if (isPracticeMission(selectedMission)) return defaultLoadout(selected);
  if (!loadoutChoices.has(selected.id)) loadoutChoices.set(selected.id, defaultLoadout(selected));
  return loadoutChoices.get(selected.id);
}
function updateLoadout() {
  const choice = selectedLoadout(),
    preset = armament(selected),
    training = unarmedPractice(selectedMission),
    check = validateLoadout(selected, choice);
  $('loadout-editor').hidden = isPracticeMission(selectedMission) || !!selected.transport;
  $('equipment-stores-info').innerHTML = trHtml(
    Object.entries(preset.weapons)
      .map(
        ([type, w]) =>
          `<button class="wiki-card-link" data-wiki="weapon-${weaponProfile(selected, type).id}">ⓘ ${w.name}</button>`,
      )
      .join(''),
  );
  updateDeparture();
  $('loadout-gun').innerHTML = trHtml(
    preset.weapons.gun
      ? `<label><input id="loadout-cannon" type="checkbox" ${choice.gun ? 'checked' : ''}> Gépágyúlőszer: ${preset.weapons.gun.name} · ${preset.weapons.gun.quantity} db</label>`
      : 'Ehhez a gépváltozathoz nincs gépágyú.',
  );
  if (preset.tailGun)
    $('loadout-gun').innerHTML +=
      `<label>Farokgépágyú lőszere · ${preset.tailGun.name}<input id="loadout-tail-rounds" type="number" min="0" max="${preset.tailGun.quantity}" step="1" value="${choice.tailGun ?? 0}"> db / ${preset.tailGun.quantity}</label><small>Külön hátsó fegyverállás. V: nézetváltás · a lőszer tömege külön beleszámít.</small>`;
  $('loadout-stations').innerHTML = trHtml(
    preset.stations
      .map(
        (station, i) =>
          `<label>${station.internal ? 'Belső' : 'Függesztési'} hely ${i + 1}<select data-station="${i}" aria-label="Fegyver a(z) ${i + 1}. helyen"><option value="">Üres</option>${stationOptions(
            selected,
            i,
          )
            .map(
              (type) =>
                `<option value="${type}" ${choice.stations[i] === type ? 'selected' : ''}>${preset.weapons[type].name} · ${type === 'aam' ? 'légi cél' : type === 'agm' ? 'földi cél' : 'bomba'}</option>`,
            )
            .join('')}</select></label>`,
      )
      .join(''),
  );
  for (const label of $('loadout-stations').querySelectorAll('label')) {
    const select = label.querySelector('select');
    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'wiki-card-link station-info';
    info.textContent = tr('ⓘ Fegyveradatlap');
    info.disabled = !select.value;
    info.onclick = () => briefing.openWiki('weapon-' + weaponProfile(selected, select.value).id);
    label.append(info);
  }
  if (preset.weapons.gun) {
    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'wiki-card-link';
    info.textContent = tr('ⓘ Gépágyú');
    info.onclick = () => briefing.openWiki('weapon-' + weaponProfile(selected, 'gun').id);
    $('loadout-gun').append(info);
  }
  $('loadout-capacity').textContent = tr(
    `${check.count} / ${check.limits.maxStores} függesztmény · ${Math.round(check.payloadKg)} / ${check.limits.maxPayloadKg} kg engedélyezett játékbeli fegyverterhelés`,
  );
  $('loadout-errors').textContent = tr(check.errors.join(' '));
  $('launch').disabled = !training && !check.valid;
  const configured = check.valid ? configureAircraft(selected, choice) : selected;
  const selectedRating = $('preview-rating');
  if (selectedRating) {
    const rating = suitability(configured, missionForSide(selectedMission, selectedSide));
    selectedRating.className = 'rating ' + rating;
    selectedRating.textContent = tr(ratingLabels[rating]);
  }
  $('planner-stores').textContent = tr(
    training
      ? `FEGYVERZET NÉLKÜL · ${Math.round(selectedFuel() * 100)}% ÜZEMANYAG`
      : !check.valid
        ? 'HIBÁS FEGYVERZET — JAVÍTSD A KIOSZTÁST'
        : [
            ...Object.values(armament(configured).weapons),
            ...(armament(configured).tailGun ? [armament(configured).tailGun] : []),
          ]
            .map((w) => `${w.name} × ${w.quantity}`)
            .join(' · ') || 'FEGYVERZET NÉLKÜL',
  );
  if (
    !selected.transport &&
    !training &&
    [
      'escort-transport',
      'defend-base',
      'defend-city',
      'ballistic-strike',
      'air-superiority',
    ].includes(selectedMission.objective) &&
    !armament(configured).weapons.aam
  )
    $('loadout-errors').textContent += ' Légi ellenfelek várhatók: légiharc-rakéta ajánlott.';
}
$('loadout-editor').addEventListener('input', (e) => {
  if (e.target.id !== 'loadout-tail-rounds') return;
  selectedLoadout().tailGun = Math.trunc(
    Math.max(0, Math.min(armament(selected).tailGun.quantity, Number(e.target.value) || 0)),
  );
  updateDeparture();
});
$('loadout-editor').addEventListener('change', (e) => {
  const choice = selectedLoadout();
  if (e.target.id === 'loadout-cannon') choice.gun = e.target.checked;
  if (e.target.id === 'loadout-tail-rounds')
    choice.tailGun = Math.trunc(
      Math.max(0, Math.min(armament(selected).tailGun.quantity, Number(e.target.value) || 0)),
    );
  if (e.target.matches('[data-station]'))
    choice.stations[Number(e.target.dataset.station)] = e.target.value;
  updateLoadout();
});
$('loadout-reset').onclick = () => {
  loadoutChoices.set(selected.id, defaultLoadout(selected));
  updateLoadout();
};
const briefing = new Briefing({
  missions,
  onPreview: renderMissionBrief,
  onMission: (m) => {
    selectedMission = m;
    selected = catalogueAircraft(m)[0];
    selectedSide = aircraftSide(selected);
    updatePlanner();
  },
  onAircraft: (a) => {
    selected = a;
    selectedSide = aircraftSide(a);
    updatePlanner();
  },
});
function renderMissionBrief(briefMission) {
  if (!briefMission) {
    $('mission-empty').hidden = false;
    $('mission-details').hidden = true;
    return;
  }
  briefMission = missionForSide(briefMission, selectedSide);
  $('mission-empty').hidden = true;
  $('mission-details').hidden = false;
  const location = missionLocation(briefMission);
  $('mission-location').textContent = tr(
    location.name + ' · ' + surfaceStyles[location.surface].label,
  );
  $('mission-threat-icons').innerHTML = trHtml(threatMarkup(briefMission));
  $('mission-code').textContent = tr(briefMission.difficulty + ' / ' + briefMission.code);
  $('mission-name').textContent = tr(briefMission.name);
  $('mission-description').textContent = tr(missionForAircraft(briefMission, selected).description);
  $('mission-threats').textContent = tr(
    missionThreatsFor(briefMission)
      .map((type) => threatTypes[type].name)
      .join(' · ') || 'NINCS FEGYVERES ELLENFÉL',
  );
  $('mission-goals').innerHTML = trHtml(
    `<h4>ELSŐDLEGES CÉLOK</h4><ol>${missionForAircraft(briefMission, selected)
      .primary.map((text) => `<li>${text}</li>`)
      .join('')}</ol>${
      briefMission.optional.length
        ? `<h4>OPCIONÁLIS</h4><ul>${missionForAircraft(briefMission, selected)
            .optional.map((text) => `<li>${text}</li>`)
            .join('')}</ul>`
        : ''
    }`,
  );
  const roster = superiorityRoster(missionForAircraft(briefMission, selected), selected),
    opponents = roster.filter((r) => r.team !== 'ally'),
    allies = roster.filter((r) => r.team === 'ally');
  $('mission-gallery').innerHTML = trHtml(
    opponents
      .map(
        (r) =>
          `<figure class="unit-preview"><canvas data-preview-unit="${r.type}" aria-label="${unitDefinition(r.type).name} forgó térbeli előnézete"></canvas><figcaption><strong>${r.count} × ${unitDefinition(r.type).name}</strong><small>${unitDefinition(r.type).category}</small><button type="button" class="wiki-card-link" data-wiki="${r.type}">ⓘ ADATLAP</button></figcaption></figure>`,
      )
      .join('') ||
      `<p class="empty-recon">${briefMission.objective === 'canyon' ? 'Nincs ellenség. Kanyonrepülés és gerinc feletti kijutás.' : 'Nincs ellenség. Csak te és a leszállópálya.'}</p>`,
  );
  $('mission-allies').innerHTML = trHtml(
    allies.length
      ? `<h4>SZÖVETSÉGES TÁMOGATÁS / VÉDENDŐ EGYSÉGEK</h4><p>${allies.map((r) => `<button class="wiki-card-link" data-wiki="${r.type}">${r.count} × ${unitDefinition(r.type).name} ⓘ ADATLAP</button>`).join(' ')}</p><small>A gép vezeti őket; te a saját repülődet irányítod.</small>`
      : '',
  );
}
function updatePlanner() {
  const choices = catalogueAircraft(selectedMission);
  if (!choices.includes(selected)) selected = choices[0];
  selectedSide = aircraftSide(selected);
  const sideMission = missionForSide(selectedMission, selectedSide);
  $('mission-count').textContent = tr(missions.length);
  $('launch').textContent = tr('KÉSZ · BEVETÉS INDÍTÁSA ↗');
  $('planner-stores').textContent = tr(
    unarmedPractice(selectedMission)
      ? `FEGYVERZET NÉLKÜL · ${Math.round(selectedFuel() * 100)}% ÜZEMANYAG`
      : Object.entries(armament(selected).weapons)
          .map(([type, w]) => `${w.name} × ${w.quantity}`)
          .join(' · '),
  );
  $('planner-variant').textContent = tr(armament(selected).variant);
  $('selected-name').textContent = tr(selected.name);
  $('preview-role').textContent = tr(selected.role.toUpperCase());
  $('preview-designation').textContent = tr(selected.name.toUpperCase());
  const stats = [
    ['MAX. SEBESSÉG', selected.maxMach.toFixed(2), 'MACH'],
    ['TOLÓERŐ', Math.round(selected.abThrust / 1000), 'KN'],
    ['MAX. TERHELÉS', selected.maxG, 'G'],
    ['ÜZEMANYAG', formatNumber(selected.fuelCapacity), 'KG'],
    [
      selected.syntheticRadar ? 'SZIM. RADAR' : 'RADAR',
      Math.round(selected.radarRange / 1000),
      'KM',
    ],
    ['CSÚCSMAGASSÁG', (selected.ceiling / 1000).toFixed(1), 'KM'],
  ];
  $('specs').innerHTML = trHtml(
    stats.map(([l, v, u]) => `<div><small>${l}</small><b>${v}<span>${u}</span></b></div>`).join(''),
  );
  updateLoadout();
  $('aircraft-count').textContent = tr(choices.length);
  briefing.update(missionForAircraft(sideMission, selected), selected, choices);
  renderMissionBrief(briefing.confirmed ? selectedMission : null);
}
function setGuideVisible(visible) {
  guideVisible = visible;
  $('phase-guide').hidden = !visible;
  $('open-guide').hidden = visible;
  document.body.classList.toggle('guide-open', playing && visible);
  writePreference('vector-flight-guide', visible ? 'open' : 'closed');
}
function toggleLandingRoute() {
  if (!playing || paused || state.crashed || state.dying) return;
  landingRouteEnabled = state.landingRouteEnabled === false;
  state.landingRouteEnabled = landingRouteEnabled;
  clearLandingRoute(state);
  writePreference('falcon-landing-route', landingRouteEnabled ? 'on' : 'off');
  recorder.event('landing-route', { enabled: landingRouteEnabled });
  toast(`LESZÁLLÁSI SEGÉDÍV ${landingRouteEnabled ? 'BE' : 'KI'} — I`);
}
function toggleApproach() {
  if (!state || paused || state.onGround) return;
  if (state.recoveryExit) {
    toast('NINCS SAJÁT FEDÉLZET · KÖVESD A KIVONULÁS PONTOT');
    return;
  }
  state.landingMode = state.approach?.active || state.landingMode === 'on' ? 'off' : 'on';
  state.approach = evaluateApproach(state);
  clearLandingRoute(state);
  toast(
    state.landingMode === 'on'
      ? 'LESZÁLLÁSI MÓD BE — G: FUTÓMŰ, X: FÉKSZÁRNY'
      : 'LESZÁLLÁSI MÓD KI',
  );
}
function selectWeapon(type) {
  if (!playing || paused) return;
  if (state.rearView) {
    toast('HÁTSÓ ÁLLÁS · CSAK FAROKGÉPÁGYÚ · V: PILÓTAFÜLKE');
    return;
  }
  if (state.training) {
    toast('GYAKORLAT — FEGYVERZET NÉLKÜL');
    return;
  }
  if (weapons.select(state, type)) toast(`FEGYVER: ${weaponLabel(state, type)}`);
  else
    toast(
      state.ammo[type] === 0 && armament(state.spec).weapons[type]
        ? 'ELFOGYOTT A LŐSZER'
        : 'EZ A FEGYVER NINCS FELSZERELVE',
    );
}
$('stores-display').addEventListener('click', (e) => {
  const b = e.target.closest('[data-weapon]');
  if (b) selectWeapon(b.dataset.weapon);
});
function toggleFlaps() {
  if (!playing || paused || state.dying || state.crashed) return;
  const fault = toggleActuator(state, 'flaps');
  toast(fault || `FÉKSZÁRNY ${state.flaps ? 'KIENGEDÉS' : 'BEHÚZÁS'} — X`);
}
function releaseDecoys(kind = 'mixed') {
  if (!playing || paused || state.dying || state.crashed) return;
  const result = deployCountermeasures(state, kind);
  toast(result.message);
  if (result.released)
    weapons.emit({ type: 'countermeasure-release', position: state.position.clone() });
}
function toggleGear() {
  if (!playing || paused || state.dying || state.crashed) return;
  if (state.onGround) {
    toast('FUTÓMŰ A FÖLDÖN NEM HÚZHATÓ BE');
    return;
  }
  const fault = toggleActuator(state, 'gear');
  if (fault) toast(fault);
}
function toggleAirbrake() {
  if (!playing || paused || state.dying || state.crashed) return;
  const fault = toggleActuator(state, 'airbrake');
  if (fault) toast(fault);
}
function toggleHook() {
  if (!playing || paused || !state?.naval || state.spec.vtol) return;
  state.naval.hook = !state.naval.hook;
  recorder.event('carrier-hook', { deployed: state.naval.hook });
  toast(state.naval.hook ? 'FÉKEZŐHOROG KIENGEDVE' : 'FÉKEZŐHOROG BEHÚZVA');
}
function cycleNozzle() {
  if (!playing || paused || !state?.spec.vtol) return;
  state.naval ??= { nozzle: 0, hook: false };
  state.naval.nozzle = (state.naval.nozzle + 45) % 135;
  recorder.event('vtol-nozzle', { degrees: state.naval.nozzle });
  toast(
    'FÚVÓCSŐ ' +
      state.naval.nozzle +
      '° · ' +
      (state.naval.nozzle === 90
        ? 'FÜGGŐLEGES'
        : state.naval.nozzle === 45
          ? 'RÖVID FELSZÁLLÁS'
          : 'ELŐREMENET'),
  );
}
function toggleAfterburner() {
  if (!playing || paused || state.dying || state.crashed) return;
  state.afterburner = state.spec.hasAB ? !state.afterburner : false;
  toast(afterburnerStatus(state).message);
}
function toggleAssist() {
  if (!playing || paused || state.dying || state.crashed) return;
  state.assist = !state.assist;
  toast(`G-KORLÁTOZÁS ${state.assist ? 'BE' : 'KI'}`);
}
$('config-afterburner').onclick = () => (state?.spec.vtol ? cycleNozzle() : toggleAfterburner());
$('config-assist').onclick = () =>
  state?.naval && !state.spec.vtol ? toggleHook() : toggleAssist();
$('config-gear').onclick = toggleGear;
$('config-airbrake').onclick = toggleAirbrake;
const wheelBrakeButton = $('config-wheel-brake');
wheelBrakeButton.addEventListener('pointerdown', (e) => {
  if (!playing || paused || !state?.onGround) return;
  e.preventDefault();
  wheelBrakeButton.setPointerCapture(e.pointerId);
  pointerWheelBrake = true;
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
  wheelBrakeButton.addEventListener(event, () => {
    pointerWheelBrake = false;
  });
$('config-flaps').onclick = toggleFlaps;
$('config-countermeasures').onclick = () => releaseDecoys();
function selectTarget() {
  if (!playing || paused) return;
  if (state.rearView) {
    toast('HÁTSÓ ÁLLÁS · EGÉRREL KÉZI CÉLZÁS · SZÓKÖZ: TŰZ');
    return;
  }
  toast(
    aim.cycle(state, targets)
      ? 'CÉL KIVÁLASZTVA — TARTSD A GÉP ELŐTT'
      : navigationJammed(state, targets)
        ? 'JELZAVARÁS — SZEMMEL KERESD A ZAVARÓT'
        : 'NINCS CÉL A RADARKÚPBAN — KÖVESD AZ IRÁNYJELZÉST',
  );
}
function toast(text, duration = 4) {
  recorder.change('message', text, 'message');
  postFlightMessage(text, state?.elapsed || 0, duration);
}
function launch() {
  controlView.hide();
  frameTelemetry.reset();
  resetFlightMessages();
  pointerWheelBrake = false;
  renderer.thirdPerson = false;
  headLook.rear = false;
  headLook.hold = false;
  headLook.limits = null;
  document.body.classList.remove('external-view', 'rear-view');
  audio.clearEffects();
  const flightMission = missionForAircraft(missionForSide(selectedMission, selectedSide), selected);
  setSurfaceMode(missionSurface(flightMission));
  targets = createTargets(flightMission, selected);
  state = createMissionAircraft(
    configureAircraft(
      selected,
      unarmedPractice(selectedMission) ? defaultLoadout(selected) : selectedLoadout(),
    ),
    flightMission,
    { fuelFraction: selectedFuel() },
  );
  headLook.reset();
  state.mapZoom = 1;
  state.headLook = { yawDeg: 0, pitchDeg: 0 };
  state.landingRouteEnabled = landingRouteEnabled;
  document.body.classList.toggle('landing-practice', !!state.training);
  weapons = new Weapons({ enemyFire: !state.training });
  weapons.selected = initialWeapon(state, selectedMission);
  aim = new Targeting();
  mission = new Mission(flightMission);
  mission.update(state, targets, weapons, aim);
  recorder.start(state, mission, targets, weapons, aim);
  recorder.event('visual-style', { id: renderer.surfaceMode });
  $('export-flight-log').disabled = false;
  updateHUD(state, targets, weapons, aim, mission, audio.muted);
  $('fuel-status').hidden = false;
  playing = true;
  paused = false;
  reported = false;
  accumulator = 0;
  keys.clear();
  $('hangar').hidden = true;
  $('hangar-footer').hidden = true;
  $('flight-ui').hidden = false;
  $('overlay').hidden = true;
  $('help').hidden = true;
  document.body.classList.add('flying');
  setGuideVisible(guideVisible);
  $('system-state').textContent = tr('REPÜLÉS AKTÍV');
  audio.start();
  audio.radio.startMission(state, mission, targets);
  $('launch').blur();
  headInput.capture();
}
function showOverlay(kind) {
  logFramePerformance(frameTelemetry.flush());
  headInput.release();
  headLook.reset();
  recorder.capture(state, mission, targets, weapons, aim, logControls(), true);
  recorder.event('pause', { reason: kind });
  if (kind !== 'pause')
    recorder.finish({
      result: kind,
      reason:
        mission.failureReason ||
        (state.landing?.reasons?.length ? state.landing.reasons : null) ||
        mission.abortReason ||
        '',
      recovered: !!mission.recovered,
      score: mission.score,
      touchdown: state.lastTouchdown || null,
    });
  recorder.flush();
  paused = true;
  keys.clear();
  audio.suspend({ radio: kind === 'success' || kind === 'aborted' });
  $('overlay').hidden = false;
  $('resume').hidden = kind !== 'pause';
  $('open-mission-control').hidden = kind !== 'pause';
  $('overlay-label').textContent = tr(
    kind === 'pause' ? 'REPÜLÉS FELFÜGGESZTVE' : 'REPÜLÉSI JELENTÉS',
  );
  $('overlay-title').textContent = tr(
    kind === 'pause'
      ? 'Tarts egy szünetet.'
      : kind === 'success'
        ? 'Küldetés teljesítve.'
        : kind === 'failure'
          ? 'Küldetés sikertelen.'
          : kind === 'aborted'
            ? 'Sikeres hazatérés.'
            : 'A gép elveszett.',
  );
  $('overlay-text').textContent = tr(
    kind === 'pause'
      ? 'A repülés és a küldetés ideje megállt.'
      : kind === 'success'
        ? mission.spec.objective === 'canyon'
          ? 'Sorrendben teljesítetted a kanyon kapuit, és átrepültél a záró gerinc fölött.'
          : mission.spec.objective === 'landing'
            ? 'Biztonságosan leszálltál és megálltál. A leszállási gyakorlat sikeres.'
            : mission.spec.objective === 'practice-bombing'
              ? 'A három inert bombából legalább kettő a célkörbe talált, majd biztonságosan leszálltál és megálltál.'
              : mission.spec.objective === 'escort'
                ? 'A civil gép sértetlenül elhagyta a légteret. Sikeresen hazahoztad a gépedet.'
                : state.recoveryExit
                  ? 'Az elsődleges feladatokat teljesítetted és biztonságosan kivonultál.'
                  : 'Az elsődleges feladatokat teljesítetted és sikeresen leszálltál.'
        : kind === 'failure'
          ? mission.failureReason
          : kind === 'aborted'
            ? 'A küldetés megszakadt, de biztonságosan hazahoztad a gépet.'
            : state.landing?.reasons?.join(' ') ||
              'Indítsd újra a feladatot, vagy válassz másik gépet a hangárban.',
  );
  $('overlay-stats').textContent = tr(
    kind === 'success'
      ? `${mission.score} PONT · REKORD ${best}${mission.spec.objective === 'canyon' ? ' · KANYONGYAKORLAT' : state.recoveryExit ? ' · KIVONULÁS' : ` · FÖLDETÉRÉS ${state.landing?.descent?.toFixed(1) || '—'} M/S`}`
      : kind === 'crash'
        ? `REPÜLT IDŐ ${Math.round(state.elapsed)} S · ${state.practice ? 'GYAKORLÓREPÜLÉS' : mission.destroyed ? 'CÉL MEGSEMMISÍTVE' : 'CÉL AKTÍV'}`
        : '',
  );
  if (kind === 'success' && state.landing?.grade && state.landing.grade !== 'smooth')
    $('overlay-text').textContent = tr(
      'A feladatokat teljesítetted és megálltál. A földetérés sérüléssel járt; a részleteket a kiértékelés mutatja.',
    );
  $('mission-debrief').hidden = kind === 'pause';
  $('mission-debrief').innerHTML = trHtml(kind === 'pause' ? '' : debriefMarkup(recorder.export()));
  if (kind === 'pause') $('resume').focus();
  else {
    $('overlay-title').focus({ preventScroll: true });
    $('overlay').querySelector('.modal').scrollTop = 0;
  }
}
function resume() {
  if (
    !playing ||
    (state.crashed && reported) ||
    mission.complete ||
    mission.failed ||
    mission.recovered
  )
    return;
  controlView.hide();
  recorder.event('resume');
  paused = false;
  keys.clear();
  accumulator = 0;
  $('overlay').hidden = true;
  $('help').hidden = true;
  audio.start();
  headInput.capture();
}
function togglePause() {
  if (!playing || state.crashed || mission.complete || mission.recovered) return;
  if (paused) resume();
  else showOverlay('pause');
}
function hangar() {
  controlView.hide();
  headInput.release();
  if (playing && !recorder.ended) {
    recorder.capture(state, mission, targets, weapons, aim, logControls(), true);
    recorder.finish({ result: 'abandoned', reason: 'Visszalépés a hangárba' });
  }
  $('fuel-status').hidden = true;
  playing = false;
  paused = false;
  keys.clear();
  audio.clearEffects();
  audio.suspend();
  pointerWheelBrake = false;
  $('hangar').hidden = false;
  briefing.show('missions');
  $('hangar-footer').hidden = false;
  $('flight-ui').hidden = true;
  $('overlay').hidden = true;
  $('help').hidden = true;
  document.body.classList.remove(
    'flying',
    'approaching',
    'guide-open',
    'wreck-view',
    'landing-practice',
    'navigation-jammed',
    'external-view',
    'rear-view',
  );
  $('system-state').textContent = tr('RENDSZER KÉSZ');
  updatePlanner();
}
function help() {
  if (playing && !paused) showOverlay('pause');
  $('help').hidden = !$('help').hidden;
}
$('map-range').onclick = cycleMapZoom;
$('radar').onclick = toggleMissionControl;
$('radar').addEventListener('keydown', (e) => {
  if (['Enter', 'Space'].includes(e.code)) {
    e.preventDefault();
    e.stopPropagation();
    toggleMissionControl();
  }
});
$('open-mission-control').onclick = toggleMissionControl;
$('close-mission-control').onclick = toggleMissionControl;
$('control-map-zoom').onclick = cycleMapZoom;
$('flight-help').onclick = help;
$('launch').onclick = launch;
$('restart').onclick = launch;
$('resume').onclick = resume;
$('back').onclick = hangar;
$('pause-button').onclick = togglePause;
$('approach-button').onclick = toggleApproach;
$('landing-route-button').onclick = toggleLandingRoute;
$('lock-button').onclick = selectTarget;
$('close-guide').onclick = () => setGuideVisible(false);
$('open-guide').onclick = () => setGuideVisible(true);
$('manual').onclick = help;
$('close-help').onclick = () => {
  $('help').hidden = true;
};
addEventListener('resize', () => renderer.resize());
document.addEventListener('pointerlockchange', () => headInput.changed());
document.addEventListener('pointerlockerror', () => headInput.failed());
$('world').addEventListener('click', () => headInput.capture());
addEventListener('mousemove', (e) => headInput.move(e, performance.now() / 1000));
addEventListener('mouseout', (e) => {
  if (!e.relatedTarget && !headInput.locked) headLook.reset();
});
addEventListener('keydown', (e) => {
  if (e.target.closest?.('[data-language-select]')) return;
  const k = e.code;
  if (!playing) return;
  if (!controlView.root.hidden) {
    if (e.repeat) return;
    if (['KeyO', 'Escape', 'KeyP'].includes(k)) {
      e.preventDefault();
      toggleMissionControl();
    } else if (['Digit0', 'Numpad0'].includes(k)) {
      e.preventDefault();
      cycleMapZoom();
    } else if (k === 'Tab') {
      e.preventDefault();
      const buttons = [...controlView.root.querySelectorAll('button,summary,[tabindex="0"]')],
        index = buttons.indexOf(document.activeElement);
      buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    }
    return;
  }
  if (k === 'Escape' && performance.now() - pointerEscapeAt < 250) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(k))
    e.preventDefault();
  if (e.repeat) return;
  if ((k === 'AltLeft' || k === 'AltRight') && playing && !paused) {
    e.preventDefault();
    headInput.release();
    toast('KURZOR SZABAD · KATTINTS A TÁJRA A NÉZELŐDÉSHEZ');
    return;
  }
  if (k === 'KeyP' || k === 'Escape') {
    if (!$('help').hidden) {
      $('help').hidden = true;
      return;
    }
    togglePause();
    return;
  }
  if (k === 'KeyO') {
    e.preventDefault();
    toggleMissionControl();
    return;
  }
  if (k === 'KeyH') {
    help();
    return;
  }
  if (k === 'KeyM') {
    audio.mute();
    return;
  }
  if (paused || state.dying || state.crashed || mission.failed) return;
  if (k === 'Digit0' || k === 'Numpad0') {
    e.preventDefault();
    cycleMapZoom();
    return;
  }
  keys.add(k);
  recorder.event('key', { code: k, pressed: true });
  if (k === 'KeyK') toggleHook();
  if (k === 'KeyU' && state.naval) toast(requestCatapult(state));
  if (k === 'KeyZ') cycleNozzle();
  if (k === 'KeyG') toggleGear();
  if (k === 'KeyX') toggleFlaps();
  if (k === 'KeyC') releaseDecoys();
  if (k === 'Digit5') releaseDecoys('flare');
  if (k === 'Digit6') releaseDecoys('chaff');
  if (k === 'KeyB') toggleAirbrake();
  if (k === 'ShiftLeft' || k === 'ShiftRight') toggleAfterburner();
  if (k === 'KeyN') toggleApproach();
  if (k === 'KeyI') toggleLandingRoute();
  if (k === 'KeyV') {
    if (!hasTailGun(state)) toast('EHHEZ A GÉPHEZ NINCS HÁTSÓ LÖVÉSZÁLLÁS');
    else {
      setRearView(state, headLook, !state.rearView);
      document.body.classList.toggle('rear-view', state.rearView);
      headInput.capture();
      toast(
        state.rearView
          ? 'HÁTSÓ LÖVÉSZÁLLÁS · EGÉR: CÉLZÁS · SZÓKÖZ: TŰZ · V: VISSZA'
          : 'PILÓTAFÜLKE',
      );
    }
  }
  if (k === 'KeyL') toggleAssist();
  if (k === 'Tab' || k === 'KeyT') selectTarget();
  const map = { Digit1: 'gun', Digit2: 'aam', Digit3: 'agm', Digit4: 'bomb' };
  if (map[k]) selectWeapon(map[k]);
});
addEventListener('keyup', (e) => {
  if (keys.has(e.code)) recorder.event('key', { code: e.code, pressed: false });
  keys.delete(e.code);
});
addEventListener('blur', () => {
  headInput.release();
  keys.clear();
  pointerWheelBrake = false;
  if (playing && !paused && !state.crashed && !mission.complete) showOverlay('pause');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing && !paused) showOverlay('pause');
});
function input() {
  const pressed = (...codes) => (codes.some((k) => keys.has(k)) ? 1 : 0);
  return {
    pitch: pressed('KeyS', 'ArrowDown') - pressed('KeyW', 'ArrowUp'),
    roll: pressed('KeyD', 'ArrowRight') - pressed('KeyA', 'ArrowLeft'),
    yaw: pressed('KeyE') - pressed('KeyQ'),
    throttle: pressed('KeyR') - pressed('KeyF'),
    brake: pointerWheelBrake || !!pressed('ControlLeft', 'ControlRight'),
  };
}
function logControls() {
  return { ...input(), fire: keys.has('Space'), keys: [...keys].sort() };
}
addEventListener('pagehide', () => recorder.flush());
function processCombatEvents() {
  for (const event of weapons.drainEvents()) {
    recorder.event('combat', event);
    audio.playEvent(event, state, targets);
    if (['operation-stage', 'operation-wave'].includes(event.type))
      toast([event.title, event.message].filter(Boolean).join(' · '), 12);
    if (event.type === 'practice-bomb-impact')
      toast(
        `${event.hit ? 'CÉLKÖR-TALÁLAT' : 'MELLÉ'} · ${event.distanceM?.toFixed(0) ?? '—'} M · ${event.hits ?? state.bombingPractice.hits}/2 TALÁLAT`,
        7,
      );
    if (event.type === 'mission-wave')
      toast(event.message || 'MÁSODIK HULLÁM · 1 VADÁSZ ÉS 2 BOMBÁZÓ KÖZELEDIK', 10);
    if (event.type === 'ballistic-launch')
      toast(
        'INTERKONTINENTÁLIS RAKÉTA KILŐVE · A SILÓ MÁR NEM ÁLLÍTJA MEG · KÖZELI SZEMBETALÁLKOZÁS KELL',
        12,
      );
  }
}
function tick(dt) {
  stepAircraft(state, input(), dt);
  recorder.time = state.elapsed;
  updateTargets(targets, dt);
  aim.update(state, targets, dt);
  if (keys.has('Space') && !state.dying && !state.crashed) {
    const message = weapons.fire(state, targets, aim);
    if (message) toast(message);
  }
  const hits = weapons.hits,
    damageHits = weapons.damageHits || 0;
  weapons.update(state, targets, dt);
  processCombatEvents();
  if (weapons.hits > hits && !state.bombingPractice)
    toast(
      mission.spec.objective === 'escort'
        ? 'CIVIL GÉP TALÁLATOT KAPOTT — KÜLDETÉS SIKERTELEN'
        : targets.some((t) => t.alive && t.team !== 'ally')
          ? 'CÉL MEGSEMMISÍTVE — A TÖBBI CÉLPONT MÉG AKTÍV'
          : 'MINDEN CÉL HARCKÉPTELEN — TÉRJ VISSZA A BÁZISRA',
      8,
    );
  else if ((weapons.damageHits || 0) > damageHits) toast('TALÁLAT — A CÉL SÉRÜLT');
  const services = mission.serviceCount || 0;
  mission.update(state, targets, weapons, aim);
  if ((mission.serviceCount || 0) > services) {
    weapons.cooldown = 0;
    weapons.tailCooldown = 0;
    weapons.gunHeat = 0;
    setRearView(state, headLook, false);
    document.body.classList.remove('rear-view');
    aim.id = null;
    aim.locked = false;
    aim.progress = 0;
    keys.clear();
    pointerWheelBrake = false;
    toast('GÉP KÉSZ · TELJES ÜZEMANYAG ÉS FEGYVERZET · R: FELSZÁLLÁS', 8);
  }
  processCombatEvents();
  recorder.capture(state, mission, targets, weapons, aim, logControls());
  const crashReportReady = advanceCrashSequence(state, dt);
  if ((state.dying || state.crashed) && state.rearView) {
    setRearView(state, headLook, false);
    document.body.classList.remove('rear-view');
  }
  document.body.classList.toggle('wreck-view', state.dying || state.crashed);
  if ((state.dying || state.crashed) && headInput.wanted) headInput.release();
  if ((crashReportReady || mission.complete || mission.failed || mission.recovered) && !reported) {
    reported = true;
    if (mission.complete) {
      best = Math.max(best, mission.score);
      writePreference('vector-flight-best', best);
    }
    showOverlay(
      state.crashed
        ? 'crash'
        : mission.failed
          ? 'failure'
          : mission.recovered
            ? 'aborted'
            : 'success',
    );
  }
}
function frame(time) {
  const start = performance.now(),
    frameMs = Math.max(0, time - last),
    delta = Math.min(frameMs / 1000, 0.1);
  last = time;
  if (playing) {
    const active = !paused,
      simulationStart = performance.now();
    if (!paused && !state.dying && !state.crashed && !renderer.thirdPerson)
      headLook.update(delta, time / 1000);
    else headLook.reset();
    state.headLook = {
      yawDeg: (headLook.yaw * 180) / Math.PI,
      pitchDeg: (headLook.pitch * 180) / Math.PI,
    };
    if (state.rearView) state.rearAim = { yaw: headLook.yaw, pitch: headLook.pitch };
    if (!paused) {
      accumulator += delta;
      while (accumulator >= STEP && !paused) {
        tick(STEP);
        accumulator -= STEP;
      }
    }
    const simulationMs = performance.now() - simulationStart,
      renderStart = performance.now();
    renderer.render(state, targets, weapons, aim);
    const renderMs = performance.now() - renderStart,
      uiStart = performance.now();
    uiElapsed += delta;
    if (uiElapsed > 0.1) {
      uiElapsed = 0;
      updateHUD(state, targets, weapons, aim, mission, audio.muted);
    }
    audio.update(state, aim, !paused, mission, targets);
    if (active && !paused)
      logFramePerformance(
        frameTelemetry.add({
          frameMs,
          simulationMs,
          renderMs,
          uiMs: performance.now() - uiStart,
          cpuMs: performance.now() - start,
        }),
      );
  } else {
    briefing.renderCards(matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : time / 1000);
    for (const canvas of $('mission-gallery').querySelectorAll('canvas')) {
      if (!canvas.getBoundingClientRect().width) continue;
      const id = canvas.dataset.previewUnit;
      renderTargetPreview(
        canvas,
        { id, kind: unitDefinition(id).kind },
        selected,
        matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : time / 1000,
        renderer.surfaceMode,
      );
    }
  }
  requestAnimationFrame(frame);
}
updatePlanner();
requestAnimationFrame(frame);

addEventListener('falcon:languagechange', () => {
  if (!playing) updatePlanner();
});
