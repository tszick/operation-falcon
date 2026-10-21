import { tr, trHtml } from './i18n.js';
import { damageWarnings } from './damage.js';
export class FlightMessages {
  constructor() {
    this.reset();
  }
  reset() {
    this.items = [];
    this.sequence = 0;
    this.channels = new Map();
  }
  setStatus(channel, key, text, detail, now, level = 'normal') {
    let current = this.channels.get(channel);
    if (current?.key === key) {
      Object.assign(current, { text, detail, level });
      return;
    }
    if (current) {
      current.active = false;
      current.expires = current.shownAt === null ? now : Math.max(current.shownAt + 4, now + 2.5);
    }
    current = this.items.find((item) => item.channel === channel && item.key === key);
    if (!current) {
      current = { id: ++this.sequence, channel, key, shownAt: null, count: 1 };
      this.items.push(current);
    }
    Object.assign(current, { text, detail, level, active: true, expires: null });
    this.channels.set(channel, current);
  }
  clearStatus(channel, now) {
    const current = this.channels.get(channel);
    if (!current) return;
    current.active = false;
    current.expires = current.shownAt === null ? now : Math.max(current.shownAt + 4, now + 2.5);
    this.channels.delete(channel);
  }
  event(text, now, duration = 4, { detail = '', level = 'normal' } = {}) {
    if (!text) return;
    let item = this.items.findLast(
      (item) =>
        !item.channel && item.text === text && item.detail === detail && now - item.last < 1,
    );
    if (item) {
      item.count++;
      item.last = now;
      if (item.expires !== null) item.expires = now + Math.max(4, duration);
      return;
    }
    this.items.push({
      id: ++this.sequence,
      text,
      detail,
      level,
      active: false,
      count: 1,
      last: now,
      duration: Math.max(4, duration),
      shownAt: null,
      expires: null,
    });
  }
  view(now, capacity = 6) {
    this.items = this.items.filter(
      (item) => item.active || item.expires === null || now < item.expires,
    );
    const active = this.items.filter((i) => i.active),
      shown = this.items.filter((i) => !i.active && i.shownAt !== null);
    const radio = this.items.filter((i) => i.level === 'radio').sort((a, b) => b.id - a.id);
    const visible = [...active, ...radio, ...shown.filter((i) => i.level !== 'radio')].slice(
      0,
      Math.max(capacity, active.length),
    );
    for (const item of this.items) {
      if (visible.length >= capacity) break;
      if (!item.active && item.shownAt === null && !visible.includes(item)) visible.push(item);
    }
    for (const item of visible)
      if (item.shownAt === null) {
        item.shownAt = now;
        if (!item.active) item.expires = now + item.duration;
      }
    return visible
      .sort((a, b) => b.shownAt - a.shownAt || b.id - a.id)
      .map((item) => ({ ...item, fading: !item.active && item.expires - now < 1.4 }));
  }
}
const feed = new FlightMessages(),
  radioFeed = new FlightMessages();
let stateOwner = null;
const nodes = new Map(),
  radioNodes = new Map();
export function resetFlightMessages() {
  feed.reset();
  radioFeed.reset();
  stateOwner = null;
  nodes.clear();
  radioNodes.clear();
  for (const id of ['flight-message-feed', 'radio-message-feed'])
    document.getElementById(id)?.replaceChildren();
}
export function postFlightMessage(text, now, duration) {
  feed.event(text, now, duration);
}
export function postRadioMessage(line, now) {
  radioFeed.event(
    line.callSign?.toUpperCase() ||
      { control: 'CONTROL', pilot: 'FALCON ONE', wingman: 'FALCON TWO', civilian: 'CIVILIAN' }[
        line.speaker
      ],
    now,
    line.duration + 1.6,
    { detail: line.text, level: 'radio' },
  );
}
export function updateFlightMessages(s, lock, aim, weapons) {
  if (stateOwner !== s) {
    if (stateOwner) resetFlightMessages();
    stateOwner = s;
  }
  const host = messageHost('flight-message-feed', 'Repülési üzenetek'),
    radioHost = messageHost('radio-message-feed', 'Rádióbeszélgetések');
  const now = s.elapsed || 0,
    key = `${aim.id || 'scan'}:${lock.state}:${weapons.selected}:${lock.solution?.status || ''}`;
  feed.setStatus(
    'target',
    key,
    lock.state === 'acquiring' ? 'CÉL BEFOGÁSA' : lock.label,
    lock.hint,
    now,
    ['jammed', 'range', 'outside'].includes(lock.state) || lock.solution?.canLaunch === false
      ? 'warning'
      : 'normal',
  );
  const faults =
    s.condition && (s.damage >= 15 || s.condition.parts.weapons <= 0.35) && !s.crashed
      ? damageWarnings(s)
      : [];
  if (!faults.length && s.damage >= 15 && !s.dying && !s.crashed)
    faults.push('SÉRÜLT SZERKEZET · FINOM MANŐVEREK');
  if (faults.length)
    feed.setStatus(
      'systems',
      faults.join('|'),
      'FEDÉLZETI RENDSZERHIBA',
      faults.join(' · '),
      now,
      'warning',
    );
  else feed.clearStatus('systems', now);
  renderMessages(host, feed, nodes, now);
  renderMessages(radioHost, radioFeed, radioNodes, now);
}
function messageHost(id, label) {
  let host = document.getElementById(id);
  if (!host) {
    host = document.createElement('section');
    host.id = id;
    host.setAttribute('role', 'log');
    host.setAttribute('aria-label', tr(label));
    host.setAttribute('aria-live', 'polite');
    (
      document.getElementById(id === 'radio-message-feed' ? 'flight-ui' : 'combat-messages') ||
      document.body
    ).prepend(host);
  }
  return host;
}
function renderMessages(host, feed, nodes, now) {
  const capacity = Math.max(2, Math.min(6, Math.floor((host.clientHeight - 15) / 90))),
    items = feed.view(now, capacity),
    ids = new Set(items.map((i) => i.id));
  for (const [id, node] of nodes)
    if (!ids.has(id)) {
      node.remove();
      nodes.delete(id);
    }
  const positioned = [];
  for (const item of items) {
    let node = nodes.get(item.id);
    if (!node) {
      node = document.createElement('article');
      node.className = 'flight-message';
      node.innerHTML = trHtml('<strong></strong><p></p>');
      node.style.transform = 'translateY(-22px)';
      node.style.opacity = '0';
      host.append(node);
      nodes.set(item.id, node);
    }
    const title = tr(item.text + (item.count > 1 ? ` ×${item.count}` : ''));
    const detail = tr(item.detail);
    if (node.firstChild.textContent !== title) node.firstChild.textContent = title;
    if (node.lastChild.textContent !== detail) node.lastChild.textContent = detail;
    node.lastChild.hidden = !item.detail;
    node.dataset.level = item.level;
    node.dataset.active = String(item.active);
    positioned.push({ node, item, height: node.offsetHeight });
  }
  const free = Math.max(
    0,
    host.clientHeight - positioned.reduce((sum, p) => sum + p.height + 14, 0),
  );
  let y = 0;
  for (const { node, item, height } of positioned) {
    node.style.transform = `translateY(${y + Math.min(free, (now - item.shownAt) * 8)}px)`;
    node.style.opacity = item.fading ? '0' : '1';
    y += height + 14;
  }
}
