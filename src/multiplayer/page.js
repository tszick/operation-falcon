import { PreflightView } from './preflightView.js';
import { renderRoomMission, missionFlightNotice } from './missionView.js';
import { MultiplayerClient } from './client.js';
import { aircraftChoices, NETWORK_STEP, neutralAxes, validRoomCode } from './protocol.js';
import { Renderer } from '../renderer.js';
import { weaponLabel } from '../armament.js';
import { weaponChoices } from './protocol.js';
import { Targeting } from '../targeting.js';
import { catalogLabel } from '../equipmentCatalog.js';
import { Vec3, Quat } from '../math.js';
import { interpolateOrientation } from './flightState.js';
import { HeadLook } from '../headLook.js';
import { HeadLookInput } from '../headLookInput.js';
import { tr } from '../i18n.js';
const $ = (id) => document.getElementById(id);
const keys = new Set(),
  toggles = new Set();
let renderer,
  headInput,
  client,
  active = false,
  connecting = false;
let last = performance.now(),
  accumulator = 0,
  uiTime = 0;
let seenCombatEvent = 0,
  combatNotice = null;
let requestedWeapon = 'gun',
  cycleTarget = false,
  firePulse = false,
  dispense = false;
let correction = new Vec3(),
  rotationCorrection = new Quat();
const head = new HeadLook(),
  weapons = { selected: 'gun', projectiles: [], trails: [], effects: [], solution: null },
  aim = new Targeting();
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
  'room-full': 'A szobában már két pilóta repül.',
  'room-started': 'Ez a közös küldetés már elindult. Új bevetéshez hozzatok létre új szobát.',
  'connection-error': 'Nem sikerült kapcsolódni a játékszerverhez.',
};
for (const id of aircraftChoices) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = catalogLabel('aircraft', id);
  $('network-aircraft').append(option);
}
function status(text) {
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
  renderer = new Renderer($('network-world'));
  renderer.surfaceMode = 'grass';
  renderer.surfaceLines = false;
  renderer.headLook = head;
  headInput = new HeadLookInput($('network-world'), head, document, {
    canLook: () => active && !client?.prediction.state?.crashed,
  });
  document.addEventListener('pointerlockchange', () => headInput.changed());
  document.addEventListener('pointerlockerror', () => headInput.failed());
  $('network-world').addEventListener('click', () => headInput.capture());
  addEventListener('mousemove', (e) => headInput.move(e, performance.now() / 1000));
  addEventListener('resize', () => renderer.resize());
  await renderer.ready;
}
function snapshotReceived(msg) {
  const own = msg.players.find((p) => p.id === client.id);
  $('network-roster').textContent = `${own.callSign} · ${msg.players.length}/2`;
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
    client = new MultiplayerClient({
      onWelcome: (msg) => {
        $('network-scenario').value = msg.scenario;
        requestedWeapon = msg.players.find((p) => p.id === msg.id).combat.selected;
        cycleTarget = firePulse = dispense = false;
        seenCombatEvent = msg.combat.eventSequence;
        combatNotice = null;
        active = true;
        busy(false);
        accumulator = 0;
        last = performance.now();
        correction = new Vec3();
        rotationCorrection = new Quat();
        $('network-lobby').hidden = true;
        preflight.code = msg.code;
        $('network-flight').hidden = msg.mission?.phase === 'waiting';
        $('network-room-code').textContent = msg.code;
        snapshotReceived(msg);
        status('Közös légtér · hang nélkül');
      },
      onSnapshot: snapshotReceived,
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
        status(failure);
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
        $('network-preflight').hidden = true;
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
$('network-create').addEventListener('click', () => connect('create'));
$('network-join').addEventListener('click', () => connect('join'));
$('network-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') connect('join');
});
$('network-leave').addEventListener('click', () => client?.disconnect());
for (const [index, type] of weaponChoices.entries()) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.weapon = type;
  button.textContent = String(index + 1);
  button.addEventListener('click', () => {
    requestedWeapon = type;
  });
  $('network-weapons').append(button);
}
$('network-target').addEventListener('click', () => {
  cycleTarget = true;
});
$('network-fire').addEventListener('click', () => {
  firePulse = true;
});
const toggleMap = {
  KeyG: 'gear',
  KeyX: 'flaps',
  KeyB: 'airbrake',
  KeyL: 'assist',
  ShiftLeft: 'afterburner',
  ShiftRight: 'afterburner',
};
const flightKeys = new Set([
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
    !active ||
    !client?.prediction.simulating ||
    !flightKeys.has(e.code) ||
    e.target.closest?.('input,select')
  )
    return;
  e.preventDefault();
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
  cycleTarget = firePulse = dispense = false;
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
function targetsAt(now) {
  const time = client.latest.time + (now - client.receivedAt) / 1000 - 0.1;
  return client.latest.players
    .filter((p) => p.id !== client.id)
    .flatMap((p) => {
      const s = client.history.sample(p.id, time);
      if (!s) return [];
      return [
        {
          id: p.id,
          type: 'fighter',
          kind: 'air',
          team: 'ally',
          aircraftId: s.spec.id,
          displayCallSign: p.callSign,
          position: s.position,
          velocity: s.velocity,
          flight: s,
          defense: s,
          alive: !s.crashed,
          falling: s.dying,
          radius: 28,
        },
      ];
    });
}
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (active && client.latest && renderer) {
    accumulator += dt;
    while (accumulator >= NETWORK_STEP) {
      if (!client.stale)
        client.prediction.step(document.hidden ? neutralAxes() : input(), [...toggles], {
          weapon: requestedWeapon,
          fire: !document.hidden && (keys.has('Space') || firePulse),
          cycle: !document.hidden && cycleTarget,
          countermeasures: !document.hidden && dispense,
        });
      cycleTarget = firePulse = dispense = false;
      toggles.clear();
      accumulator -= NETWORK_STEP;
    }
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
    try {
      const renderTime = client.latest.time + (now - client.receivedAt) / 1000 - 0.1;
      const combat = client.combat.sample(renderTime);
      Object.assign(weapons, {
        projectiles: combat.projectiles,
        effects: combat.effects,
        trails: combat.trails,
      });
      renderer.render(view, [...targetsAt(now), ...combat.targets], weapons, aim);
    } catch (error) {
      active = false;
      client.disconnect();
      status('A repülési nézet nem indítható. Ellenőrizd a böngésző grafikus támogatását.');
      console.error(error);
    }
    uiTime += dt;
    if (uiTime > 0.15) {
      uiTime = 0;
      $('network-instruments').textContent =
        `${Math.round(s.ias * 3.6)} km/h · ${Math.round(s.position.y)} m · ${tr('Üzemanyag')} ${Math.round((s.fuel / s.spec.fuelCapacity) * 100)}% · ${s.g.toFixed(1)} G · ${tr('Gép állapota')} ${Math.round(100 - s.damage)}% · ${client.rtt === null ? '—' : Math.round(client.rtt)} ms`;
      const own = client.latest.players.find((p) => p.id === client.id);
      for (const button of $('network-weapons').querySelectorAll('button')) {
        const type = button.dataset.weapon;
        button.textContent = `${weaponChoices.indexOf(type) + 1} · ${tr(weaponLabel(s, type))} · ${s.ammo[type] ?? 0}`;
        button.classList.toggle('selected', type === own.combat.selected);
        button.setAttribute('aria-pressed', String(type === own.combat.selected));
      }
      const lock = own.combat.aim;
      $('network-lock').textContent = lock.id
        ? `${tr(lock.locked ? 'CÉL BEFOGVA' : 'CÉLBEFOGÁS')} · ${Math.round(Math.min(1, lock.progress / s.spec.lockTime) * 100)}%`
        : tr('Nincs kijelölt cél');
      $('network-fire-status').textContent = tr(own.combat.feedback);
      $('network-combat-notice').textContent =
        combatNotice && now < combatNotice.until ? tr(combatNotice.text) : '';
      renderRoomMission($('network-mission'), client.latest.mission);
      for (const id of ['network-target', 'network-fire'])
        $(id).disabled = !client.prediction.simulating || s.crashed || s.dying;
      const completed = client.latest.combat.targets.filter(
        (t) => t.rangeTarget && !t.alive,
      ).length;
      $('network-range').hidden = !!client.latest.mission;
      $('network-range').textContent =
        tr(`Gyakorlócélok: ${completed}/2`) +
        ` · IR ${s.countermeasures.flare} / R ${s.countermeasures.chaff}`;
      const ai = client.latest.combat.ai;
      const fighter = client.latest.combat.targets.find((t) => t.aiControlled);
      const states = {
        engaging: 'Ellenséges vadász: harcban',
        evading: 'Ellenséges vadász: kitér',
        returning: 'Ellenséges vadász: kivonul',
        withdrawn: 'Ellenséges vadász: elhagyta a légteret',
        falling: 'Ellenséges vadász: zuhan',
        destroyed: 'Ellenséges vadász: megsemmisült',
      };
      $('network-ai-status').hidden =
        !ai || (client.latest.mission && client.latest.mission.phase !== 'active');
      $('network-ai-status').textContent = ai
        ? tr(
            ai.remaining > 0
              ? `Felkészülés a légiharcra: ${Math.ceil(ai.remaining)} s`
              : states[fighter?.aiState] || 'Ellenséges vadász: harcban',
          )
        : '';

      $('network-warning').textContent = tr(
        client.stale
          ? 'A kapcsolat késik — a szerver állapotára várunk.'
          : missionFlightNotice(client.latest.mission, s.crashed) ||
              (s.crashed
                ? 'A gép lezuhant. Új géphez lépj ki, majd csatlakozz újra.'
                : (s.incomingMissiles > 0
                    ? `RAKÉTA KÖZELEDIK · ${s.incomingMissiles} · C: ELTERELŐ`
                    : s.warning) ||
                  (client.latest.players.length < 2
                    ? 'A második pilótára várunk. Add át neki a szobakódot.'
                    : 'Két pilóta a közös légtérben.')),
      );
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
