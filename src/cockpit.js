import { mountCockpitInterior, updateCockpitInterior } from './rendering/cockpitInterior.js';
import { tr, trHtml } from './i18n.js';
import { cockpitHeight, cockpitProjection } from './cockpitGeometry.js';
let layoutKey = '';
export function mountCockpit() {
  if (document.getElementById('cockpit')) return;
  const ui = document.getElementById('flight-ui');
  if (!ui) return;
  const root = document.createElement('section');
  root.id = 'cockpit';
  root.setAttribute('aria-label', tr('Fedélzeti műszerfal'));
  root.innerHTML =
    trHtml(`<svg id="cockpit-frame" viewBox="0 0 1600 260" preserveAspectRatio="none" aria-hidden="true">
    <path class="cockpit-shell" d="M0 62L260 26L520 8H1080L1340 26L1600 62V260H0Z"/>
    <path class="cockpit-rim" d="M0 62L260 26L520 8H1080L1340 26L1600 62L1592 76L1336 40L1078 22H522L264 40L8 76Z"/>
    <path class="cockpit-seams" d="M360 36L375 260M770 22V260M1040 22L1030 260M1320 42L1300 260M0 245H1600"/>
    <path class="cockpit-trim" d="M25 81L251 50M535 30H1065M1349 50L1575 81"/>
    <g class="cockpit-fasteners"><circle cx="22" cy="95" r="4"/><circle cx="350" cy="58" r="4"/><circle cx="785" cy="33" r="4"/><circle cx="1024" cy="33" r="4"/><circle cx="1323" cy="60" r="4"/><circle cx="1578" cy="95" r="4"/></g>
  </svg><div class="cockpit-instruments">
    <section id="cockpit-weapons" class="cockpit-screen"></section>
    <section id="cockpit-radar" class="cockpit-screen"></section>
    <section id="cockpit-engine" class="cockpit-screen"></section>
    <section id="cockpit-right"><section id="cockpit-controls" class="cockpit-screen"></section>
      <section id="cockpit-landing" class="cockpit-screen"></section>
      <section id="cockpit-guide" class="cockpit-screen"></section></section>
  </div>`);
  mountCockpitInterior(ui);
  ui.append(root);
  const move = (id, to) => {
    const node = document.getElementById(id);
    if (node) document.getElementById(to).append(node);
  };
  move('stores-display', 'cockpit-weapons');
  move('landing-guidance', 'cockpit-landing');
  move('map-heading', 'cockpit-radar');
  move('radar', 'cockpit-radar');
  move('landing-attitude', 'cockpit-landing');
  move('target-data', 'cockpit-radar');
  move('config-countermeasures', 'cockpit-radar');
  move('landing-route-button', 'cockpit-landing');
  document.getElementById('radar').dataset.native2d = 'true';
  const missionCard = document.getElementById('mission-card');
  const pause = document.querySelector('#overlay .modal');
  if (pause) {
    missionCard.hidden = true;
    pause.insertBefore(missionCard, document.getElementById('result-details'));
  } else missionCard.remove();
  move('flight-config', 'cockpit-controls');
  move('phase-guide', 'cockpit-guide');
  move('open-guide', 'cockpit-guide');
  const old = document.getElementById('fuel-status');
  old.remove();
  document.getElementById('cockpit-engine').innerHTML = trHtml(
    `<section id="fuel-status" aria-label="Üzemanyag, gázkar és G-terhelés"><div id="fuel-gauge" role="group" aria-label="Üzemanyagszint"><span id="fuel-label">FUEL</span><strong id="fuel-value">100%</strong><div id="fuel-meter" role="meter" aria-label="Üzemanyag" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span id="fuel-fill"></span></div></div><div class="cockpit-range"><span id="fuel-range">— KM</span><span id="fuel-quantity"></span></div><div id="g-load" role="meter" aria-label="G-terhelés" aria-valuemin="-4" aria-valuemax="9" aria-valuenow="1" data-level="normal"><span>G</span><strong id="g-value">+1.0</strong></div><div id="throttle-status" role="meter" aria-label="Gázkar állása" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span>GÁZ</span><b id="throttle-value">0%</b><div class="throttle-track"><span id="throttle-fill"></span></div></div></section>`,
  );
  const oldBrake = document.getElementById('config-wheel-brake'),
    brake = document.createElement('button');
  brake.id = oldBrake.id;
  brake.type = 'button';
  brake.title = tr('Ctrl: tartsd nyomva a kerékfékhez');
  oldBrake.replaceWith(brake);
  document.getElementById('phase-guide').setAttribute('aria-label', tr('Mission Control'));
  layoutKey = '';
  layoutCockpit();
  window.addEventListener('resize', layoutCockpit);
}
export function layoutCockpit() {
  const root = document.getElementById('cockpit');
  if (!root) return;
  const w = window.innerWidth,
    h = window.innerHeight,
    key = `${w}:${h}`;
  if (key === layoutKey) return;
  layoutKey = key;
  document.body.style.setProperty('--cockpit-height', `${cockpitHeight(w, h)}px`);
}
export function updateCockpit(s) {
  const root = document.getElementById('cockpit');
  if (!root) return;
  root.classList.toggle(
    'cockpit-landing',
    !!s.approach?.active &&
      !s.onGround &&
      !s.crashed &&
      !document.body.classList.contains('navigation-jammed'),
  );
  document.getElementById('fuel-fill').style.width =
    `${Math.max(0, Math.min(100, (s.fuel / s.spec.fuelCapacity) * 100))}%`;
  document.getElementById('throttle-fill').style.width =
    `${Math.max(0, Math.min(100, s.throttle * 100))}%`;
  const radar = document.getElementById('radar');
  const rw = Math.round(radar.clientWidth),
    rh = Math.round(radar.clientHeight);
  if (rw > 0 && rh > 0 && (radar.width !== rw || radar.height !== rh)) {
    radar.width = rw;
    radar.height = rh;
  }
}
export function updateCockpitView(root, width, height, head) {
  if (!root || root.hidden) return;
  const yaw = head?.yaw || 0,
    pitch = head?.pitch || 0;
  const key = `${width}:${height}:${yaw.toFixed(4)}:${pitch.toFixed(4)}`;
  if (root.dataset.view === key) return;
  root.dataset.view = key;
  const matrix = cockpitProjection(width, height, yaw, pitch);
  root.style.transform = `matrix3d(${matrix.join(',')})`;
  updateCockpitInterior(
    root.parentElement?.querySelector('#cockpit-interior'),
    width,
    height,
    yaw,
    pitch,
  );
}
