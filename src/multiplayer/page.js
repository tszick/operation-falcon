import { FrameClock } from '../frameClock.js';
import { Spectator } from './spectator.js';
import { PlayersView } from './playersView.js';
import { MultiplayerDiagnostics } from './diagnostics.js';
import { PreflightView } from './preflightView.js';
import { renderRoomMission } from './missionView.js';
import { MultiplayerClient } from './client.js';
import { aircraftChoices, NETWORK_STEP, neutralAxes, validRoomCode } from './protocol.js';
import { Renderer } from '../renderer.js';
import { FlightInstrumentLayer } from '../rendering/flightInstrumentLayer.js';
import { MultiplayerHUD } from './hudView.js';
import { weaponChoices } from './protocol.js';
import { Targeting } from '../targeting.js';
import { catalogLabel } from '../equipmentCatalog.js';
import { Vec3, Quat } from '../math.js';
import { interpolateOrientation } from './flightState.js';
import { HeadLook } from '../headLook.js';
import { HeadLookInput } from '../headLookInput.js';
import { tr } from '../i18n.js';
const $ = (id) => document.getElementById(id);
const diagnostics = MultiplayerDiagnostics.open();
const frameClock = diagnostics ? new FrameClock() : null;
const keys = new Set(),
  toggles = new Set();
let renderer,
  flightInstruments,
  headInput,
  client,
  active = false,
  connecting = false;
let last = performance.now(),
  accumulator = 0,
  uiTime = 0;
let pilotConnections = new Map();
let seenCombatEvent = 0,
  combatNotice = null;
let requestedWeapon = 'gun',
  cycleTarget = false,
  dispense = false;
let correction = new Vec3(),
  rotationCorrection = new Quat();
const head = new HeadLook(),
  weapons = { selected: 'gun', projectiles: [], trails: [], effects: [], solution: null },
  aim = new Targeting();
const spectator = new Spectator();
const canControl = () =>
  active &&
  client?.prediction.simulating &&
  !client.prediction.state?.dying &&
  !client.prediction.state?.crashed;
const playersView = new PlayersView($('network-players'), (id) => {
  if (
    spectator.choose(
      id,
      client.latest,
      client.id,
      client.latest.players.find((p) => p.id === client.id)?.state,
    )
  )
    releaseControls();
});
const hud = new MultiplayerHUD({
  toggle: (key) => {
    if (canControl()) toggles.add(key);
  },
  countermeasures: () => {
    if (canControl()) dispense = true;
  },
  cycle: () => {
    if (canControl()) cycleTarget = true;
  },
  weapon: (type) => {
    if (canControl()) requestedWeapon = type;
  },
  release: () => releaseControls(),
  brake: (down) => {
    if (down && canControl()) keys.add('ControlLeft');
    else keys.delete('ControlLeft');
  },
});
const preflight = new PreflightView($('network-preflight'), (message) => client.send(message));
preflight.onLeave = () => client?.disconnect();
addEventListener('falcon:languagechange', () => preflight.refreshLanguage());
const statusText = {
  'lobby-changed': 'Az előszoba módosult. Ellenőrizd az új beállításokat, és próbáld újra.',
  'lobby-locked': 'A bevetés már elindult, a felszerelés nem módosítható.',
  'loadout-invalid': 'Hibás vagy túl nehéz felszerelés.',
  'not-host': 'A küldetést csak a szobagazda változtathatja.',
  'server-full': 'A szerver megtelt. Próbáld később.',
  'room-missing': 'Nincs ilyen szoba. Ellenőrizd a kódot.',
  'room-full': 'A szobában már öt pilóta repül.',
  'session-invalid': 'A mentett munkamenet már nem érvényes. Hozz létre új szobát.',
  'round-active': 'Az új menet csak a befejezett kör után indítható.',
  'not-ready': 'Legalább két pilóta és mindenki készültsége szükséges az induláshoz.',
  'room-started': 'Ez a közös küldetés már elindult. Új bevetéshez hozzatok létre új szobát.',
  'connection-timeout': 'A szerver nem válaszolt időben. Próbálj újra kapcsolódni.',
  'connection-error': 'Nem sikerült kapcsolódni a játékszerverhez.',
};
for (const id of aircraftChoices) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = catalogLabel('aircraft', id);
  $('network-aircraft').append(option);
}
function status(text, error = false) {
  $('network-status').dataset.error = String(error);
  $('network-status').textContent = tr(text);
}
function busy(value) {
  connecting = value;
  for (const id of [
    'network-create',
    'network-join',
    'network-aircraft',
    'network-code',
    'network-scenario',
  ])
    $(id).disabled = value;
}
async function setupRenderer() {
  if (renderer) return renderer.ready;
  await hud.mount();
  renderer = new Renderer($('network-world'), { backgroundTerrain: true });
  renderer.surfaceMode = 'grass';
  renderer.surfaceLines = false;
  renderer.headLook = head;
  diagnostics?.bindRenderer(renderer);
  headInput = new HeadLookInput($('network-world'), head, document, {
    canLook: () => active && !client?.prediction.state?.crashed,
  });
  document.addEventListener('pointerlockchange', () => headInput.changed());
  document.addEventListener('pointerlockerror', () => headInput.failed());
  $('network-world').addEventListener('click', () => headInput.capture());
  addEventListener('mousemove', (e) => headInput.move(e, performance.now() / 1000));
  addEventListener('resize', () => renderer.resize());
  await renderer.ready;
  flightInstruments = new FlightInstrumentLayer(renderer);
  await flightInstruments.prepareAssets();
}
function snapshotReceived(msg) {
  const own = msg.players.find((p) => p.id === client.id);
  if (renderer) renderer.surfaceMode = msg.world?.surface || 'grass';
  const bots = msg.players.filter((p) => !p.connected).length;
  $('network-roster').textContent =
    `${own.callSign} · ${msg.players.length}/5${bots ? ' · AI ' + bots : ''}`;
  for (const p of msg.players) {
    if (pilotConnections.get(p.id) === true && !p.connected)
      combatNotice = {
        text: p.callSign + ' · ' + tr('AI átvette az irányítást.'),
        until: performance.now() + 6000,
      };
  }
  pilotConnections = new Map(msg.players.map((p) => [p.id, p.connected]));
  Object.assign(aim, own.combat.aim);
  weapons.selected = own.combat.selected;
  if (active)
    for (const event of msg.combat.events) {
      if (event.id > seenCombatEvent && event.friendlyFire && msg.time - event.time < 0.5) {
        const text =
          event.sourceId === client.id
            ? 'BARÁTI TŰZ — SAJÁT GÉPET TALÁLTÁL EL!'
            : event.targetId === client.id
              ? 'BARÁTI TALÁLAT ÉRTE A GÉPED!'
              : null;
        if (text) combatNotice = { text, until: performance.now() + 6000 };
      }
    }
  seenCombatEvent = msg.combat.eventSequence;
  preflight.update({ ...msg, code: client.code }, client.id);
  $('network-flight').hidden = msg.mission?.phase === 'waiting';
  hud.show(msg.mission?.phase !== 'waiting');
  playersView.update(msg, client.id, spectator, own.state);
  const ended = ['success', 'failed'].includes(msg.mission?.phase);
  $('network-rematch').hidden = !ended;
  $('network-rematch').disabled = msg.lobby?.hostId !== client.id;
  $('network-rematch').title = tr(
    msg.lobby?.hostId === client.id
      ? 'Vissza az előszobába'
      : 'A szobagazda indítja az új menetet.',
  );
  if (!ended || (own.state.dying && !own.state.crashed)) $('network-mission').hidden = true;
}
async function connect(mode) {
  if (connecting || active) return;
  const code = $('network-code').value.trim().toUpperCase();
  if (mode === 'join' && !validRoomCode(code)) {
    status('Adj meg egy hatkarakteres szobakódot.');
    return;
  }
  busy(true);
  let failure = '';
  status('Kapcsolódás…');
  try {
    await setupRenderer();
    releaseControls();
    preflight.reset();
    renderer.wreckOffset = null;
    document.body.classList.remove('spectating', 'wreck-view');
    client = new MultiplayerClient({
      onTiming: diagnostics
        ? (kind, start, duration) => diagnostics.trace.recordNetwork(kind, start, duration)
        : null,
      reconnectDelays: [1000, 2000, 4000],
      onReconnecting: ({ attempt, total }) => {
        active = false;
        releaseControls();
        busy(true);
        hud.show(false);
        preflight.reset();
        $('network-preflight').hidden = true;
        $('network-flight').hidden = false;
        $('network-mission').hidden = true;
        $('network-rematch').hidden = true;
        $('network-players').hidden = true;
        $('network-spectator').hidden = true;
        status(`Kapcsolat helyreállítása · ${attempt}/${total} · A gépedet az AI vezeti.`);
      },
      onWelcome: (msg) => {
        diagnostics?.reset();
        failure = '';
        renderer.wreckOffset = null;
        document.body.classList.remove('spectating', 'wreck-view');
        $('network-scenario').value = msg.scenario;
        requestedWeapon = msg.players.find((p) => p.id === msg.id).combat.selected;
        cycleTarget = dispense = false;
        seenCombatEvent = msg.combat.eventSequence;
        combatNotice = null;
        hud.reset();
        spectator.reset();
        pilotConnections = new Map();
        $('network-code').value = msg.code;
        active = true;
        busy(false);
        accumulator = 0;
        last = performance.now();
        frameClock?.reset();
        correction = new Vec3();
        rotationCorrection = new Quat();
        $('network-lobby').hidden = true;
        preflight.code = msg.code;
        $('network-flight').hidden = msg.mission?.phase === 'waiting';
        $('network-room-code').textContent = msg.code;
        snapshotReceived(msg);
        status(msg.resumed ? 'Visszavetted a géped irányítását.' : 'Közös légtér · hang nélkül');
        if (msg.resumed)
          combatNotice = {
            text: 'Visszavetted a géped irányítását.',
            until: performance.now() + 6000,
          };
      },
      onSnapshot: snapshotReceived,
      onRound: (msg) => {
        diagnostics?.reset();
        releaseControls();
        spectator.reset();
        preflight.reset();
        hud.reset();
        correction = new Vec3();
        rotationCorrection = new Quat();
        renderer.thirdPerson = renderer.cinematic = false;
        renderer.wreckOffset = null;
        requestedWeapon = msg.players.find((p) => p.id === client.id).combat.selected;
        seenCombatEvent = msg.combat.eventSequence;
        combatNotice = null;
        accumulator = 0;
        document.body.classList.remove('spectating', 'wreck-view');
        $('network-spectator').hidden = true;
      },
      onReconcile: (before, after) => {
        correction = before.position.clone().add(correction).sub(after.position);
        if (correction.length() > 100) correction = new Vec3();
        const inverse = new Quat(
          -after.orientation.x,
          -after.orientation.y,
          -after.orientation.z,
          after.orientation.w,
        );
        rotationCorrection = rotationCorrection
          .clone()
          .multiply(before.orientation)
          .multiply(inverse)
          .normalize();
      },
      onStatus: (code) => {
        failure = statusText[code] || 'Nem sikerült kapcsolódni a játékszerverhez.';
        status(failure, true);
        if (active && client.latest?.mission?.phase === 'waiting') preflight.reject(failure);
        if (!active) {
          client.disconnect();
        }
      },
      onClose: () => {
        active = false;
        keys.clear();
        toggles.clear();
        headInput?.release();
        busy(false);
        $('network-lobby').hidden = false;
        $('network-flight').hidden = true;
        hud.show(false);
        $('network-preflight').hidden = true;
        $('network-players').hidden = true;
        $('network-players-toggle').setAttribute('aria-expanded', 'false');
        $('network-spectator').hidden = true;
        document.body.classList.remove('spectating');
        status(failure || 'A kapcsolat lezárult. Újra csatlakozhatsz a szobakóddal.');
      },
    });
    client.connect({
      mode,
      code,
      scenario: $('network-scenario').value,
      aircraftId: $('network-aircraft').value,
    });
  } catch (error) {
    busy(false);
    status('A repülési nézet nem indítható. Ellenőrizd a böngésző grafikus támogatását.');
    console.error(error);
  }
}
try {
  $('network-code').value = sessionStorage.getItem('falcon-last-room') || '';
} catch {
  /* Storage is optional. */
}
$('network-create').addEventListener('click', () => connect('create'));
$('network-join').addEventListener('click', () => connect('join'));
$('network-code').addEventListener('keydown', (e) => {
  if (
    active &&
    ['BracketLeft', 'BracketRight'].includes(e.code) &&
    !e.target.closest?.('input,select')
  ) {
    e.preventDefault();
    if (!e.repeat) cycleSpectator(e.code === 'BracketLeft' ? -1 : 1);
    return;
  }
  if (e.key === 'Enter') connect('join');
});
$('network-rematch').addEventListener('click', () => {
  if (!client?.latest?.lobby) return;
  releaseControls();
  $('network-rematch').disabled = true;
  client.send({ type: 'rematch', revision: client.latest.lobby.revision });
});
$('network-players-toggle').addEventListener('click', () => {
  const panel = $('network-players');
  panel.hidden = !panel.hidden;
  $('network-players-toggle').setAttribute('aria-expanded', String(!panel.hidden));
});
function cycleSpectator(direction) {
  if (!client?.latest) return;
  spectator.cycle(
    direction,
    client.latest,
    client.id,
    client.latest.players.find((p) => p.id === client.id)?.state,
  );
  releaseControls();
}
$('spectator-prev').addEventListener('click', () => cycleSpectator(-1));
$('spectator-next').addEventListener('click', () => cycleSpectator(1));
$('network-leave').addEventListener('click', () => client?.disconnect());
const toggleMap = {
  KeyG: 'gear',
  KeyX: 'flaps',
  KeyB: 'airbrake',
  KeyL: 'assist',
  KeyN: 'landing',
  KeyI: 'landingGuide',
  ShiftLeft: 'afterburner',
  ShiftRight: 'afterburner',
};
const flightKeys = new Set([
  'Digit0',
  'KeyO',
  'KeyH',
  'Space',
  'Tab',
  'KeyT',
  'KeyC',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'KeyQ',
  'KeyE',
  'KeyR',
  'KeyF',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ControlLeft',
  'ControlRight',
  ...Object.keys(toggleMap),
]);
addEventListener('keydown', (e) => {
  if (
    active &&
    ['BracketLeft', 'BracketRight'].includes(e.code) &&
    !e.target.closest?.('input,select')
  ) {
    e.preventDefault();
    if (!e.repeat) cycleSpectator(e.code === 'BracketLeft' ? -1 : 1);
    return;
  }
  if (
    !active ||
    !client?.prediction.simulating ||
    !flightKeys.has(e.code) ||
    e.target.closest?.('input,select')
  )
    return;
  e.preventDefault();
  if (!e.repeat && e.code === 'Digit0') hud.zoomIn();
  if (!e.repeat && e.code === 'KeyO') {
    releaseControls();
    hud.toggleMap();
  }
  if (!e.repeat && e.code === 'KeyH') hud.guide(document.getElementById('phase-guide').hidden);
  if (!canControl()) return;
  keys.add(e.code);
  if (!e.repeat && toggleMap[e.code]) toggles.add(toggleMap[e.code]);
  if (!e.repeat && ['Tab', 'KeyT'].includes(e.code)) cycleTarget = true;
  if (!e.repeat && e.code === 'KeyC') dispense = true;
  if (/^Digit[1-4]$/.test(e.code)) requestedWeapon = weaponChoices[Number(e.code.slice(-1)) - 1];
});
addEventListener('keyup', (e) => keys.delete(e.code));
function releaseControls() {
  keys.clear();
  toggles.clear();
  cycleTarget = dispense = false;
  headInput?.release();
}
addEventListener('blur', releaseControls);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseControls();
});
addEventListener('pagehide', () => client?.disconnect());
const pressed = (...codes) => Number(codes.some((code) => keys.has(code)));
function input() {
  return {
    pitch: pressed('KeyS', 'ArrowDown') - pressed('KeyW', 'ArrowUp'),
    roll: pressed('KeyD', 'ArrowRight') - pressed('KeyA', 'ArrowLeft'),
    yaw: pressed('KeyE') - pressed('KeyQ'),
    throttle: pressed('KeyR') - pressed('KeyF'),
    brake: !!pressed('ControlLeft', 'ControlRight'),
  };
}
function targetsAt(now, excludedId = client.id) {
  const time = client.latest.time + (now - client.receivedAt) / 1000 - 0.1;
  return client.latest.players
    .filter((p) => p.id !== excludedId)
    .flatMap((p) => {
      const s = client.history.sample(p.id, time);
      if (!s) return [];
      return [
        {
          id: p.id,
          type: 'fighter',
          kind: 'air',
          team: client.latest.scenario === 'arena' ? 'enemy' : 'ally',
          aircraftId: s.spec.id,
          displayCallSign: p.callSign,
          position: s.position,
          velocity: s.velocity,
          flight: s,
          defense: s,
          alive: !s.crashed && !s.dying,
          falling: s.dying && !s.crashed,
          radius: 28,
        },
      ];
    });
}
function frame(now) {
  const frameStart = performance.now(),
    frameMs = Math.max(0, now - last);
  const timing = frameClock?.begin(now, frameStart);
  const dt = Math.min(0.1, frameMs / 1000);
  last = now;
  if (active && client.latest && renderer) {
    accumulator += dt;
    while (accumulator >= NETWORK_STEP) {
      if (!client.stale)
        client.prediction.step(
          document.hidden || !canControl() ? neutralAxes() : input(),
          canControl() ? [...toggles] : [],
          {
            weapon: requestedWeapon,
            fire: canControl() && !document.hidden && keys.has('Space'),
            cycle: canControl() && !document.hidden && cycleTarget,
            countermeasures: canControl() && !document.hidden && dispense,
          },
        );
      cycleTarget = dispense = false;
      toggles.clear();
      accumulator -= NETWORK_STEP;
    }
    const simulationEnd = performance.now();
    head.update(dt, now / 1000);
    const s = client.prediction.state;
    correction.scale(Math.exp(-dt / 0.12));
    rotationCorrection = interpolateOrientation(
      rotationCorrection,
      new Quat(),
      1 - Math.exp(-dt / 0.12),
    );
    const view = {
      ...s,
      position: s.position.clone().add(correction),
      orientation: rotationCorrection.clone().multiply(s.orientation),
    };
    let targets = [];
    try {
      const renderTime = client.latest.time + (now - client.receivedAt) / 1000 - 0.1;
      const combat = client.combat.sample(renderTime);
      Object.assign(weapons, {
        projectiles: combat.projectiles,
        effects: combat.effects,
        trails: combat.trails,
      });
      const own = client.latest.players.find((p) => p.id === client.id);
      const available = spectator.update(client.latest, client.id, own.state);
      const observed = spectator.id && client.history.sample(spectator.id, renderTime);
      const observing = !!observed;
      renderer.thirdPerson = renderer.cinematic = observing;
      document.body.classList.toggle('spectating', observing);
      $('network-spectator').hidden =
        !own.state.crashed || client.latest.mission?.phase === 'waiting';
      const spectatorLabel =
        tr(observing ? 'MEGFIGYELÉS' : 'Nincs megfigyelhető pilóta') +
        (observing
          ? ' · ' + client.latest.players.find((p) => p.id === spectator.id).callSign
          : '');
      if ($('spectator-label').textContent !== spectatorLabel)
        $('spectator-label').textContent = spectatorLabel;
      $('spectator-prev').disabled = $('spectator-next').disabled = available.length < 2;
      targets = [...targetsAt(now, observing ? spectator.id : client.id), ...combat.targets];
      renderer.render(observed || view, targets, weapons, aim);
    } catch (error) {
      active = false;
      client.disconnect();
      status('A repülési nézet nem indítható. Ellenőrizd a böngésző grafikus támogatását.');
      console.error(error);
    }
    const renderEnd = performance.now();
    uiTime += dt;
    let hudMs = 0;
    if (uiTime > 0.15) {
      const hudStarted = performance.now();
      uiTime = 0;
      const own = client.latest.players.find((p) => p.id === client.id);
      weapons.cooldown = own.combat.cooldown;
      weapons.gunHeat = own.combat.gunHeat;
      const notice = client.stale
        ? 'A kapcsolat késik — a szerver állapotára várunk.'
        : combatNotice && now < combatNotice.until
          ? combatNotice.text
          : '';
      hud.update(view, targets, weapons, aim, client.latest, client.id, notice);
      const ended = ['success', 'failed'].includes(client.latest.mission?.phase);
      const showResult = ended && !(own.state.dying && !own.state.crashed);
      $('network-mission').hidden = !showResult;
      if (showResult) renderRoomMission($('network-mission'), client.latest.mission);
      hudMs = performance.now() - hudStarted;
    }
    const instrumentStarted = performance.now();
    flightInstruments?.render();
    const instrumentMs = performance.now() - instrumentStarted;
    const frameEnd = performance.now();
    diagnostics?.frame(
      {
        frameMs,
        startedAt: frameStart,
        ...timing,
        hudMs,
        instrumentMs,
        cpuMs: frameEnd - frameStart,
        simulationMs: simulationEnd - frameStart,
        renderMs: renderEnd - simulationEnd,
        uiMs: frameEnd - renderEnd,
      },
      client,
      flightInstruments?.metrics,
    );
  }
  requestAnimationFrame(frame);
  frameClock?.end(performance.now());
}
requestAnimationFrame(frame);
