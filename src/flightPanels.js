import { escapeHtml as esc } from './ui/html.js';
import { objectiveRows } from './missionProgress.js';
import { flapStatus } from './flaps.js';
import { approachSpeeds } from './performance.js';

export const flightClock = (t) =>
  `${Math.floor(Math.max(0, t) / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(Math.max(0, t) % 60)
    .toString()
    .padStart(2, '0')}`;
export function missionCardState(s, m, targets = []) {
  const by = (id) => targets.find((t) => t.id === id),
    civil = targets.find((t) => t.civilian);
  let rows = objectiveRows(s, m, targets);
  const failed = new Set();
  if (s.crashed) {
    failed.add('landing');
    failed.add('return');
  }
  if (!m.aborted && !m.spec.mirrored) {
    if (m.spec.objective === 'bridge-block' && by('CONVOY')?.crossedBridge && !m.bridgeSecured)
      failed.add('bridge');
    if (m.spec.objective === 'defend-base' && by('BASE')?.alive === false) failed.add('base');
    if (
      m.spec.objective === 'escort-transport' &&
      by('TRANSPORT')?.alive === false &&
      !by('TRANSPORT')?.exited
    )
      failed.add('transport');
    if (m.spec.objective === 'airbase-strike' && by('BASE')?.alive === false) {
      failed.add('base');
      failed.add('convoy');
    }
    if (
      civil &&
      (civil.damage > 0 ||
        civil.flight?.damage > 0 ||
        (civil.alive === false && !civil.departedAirspace))
    ) {
      failed.add('civil-lock');
      failed.add('civil-exit');
    }
  }
  rows = rows.map((o) => ({
    ...o,
    status:
      failed.has(o.id) || o.status === 'failed'
        ? 'failed'
        : o.done
          ? 'done'
          : m.failed || s.crashed
            ? 'failed'
            : 'pending',
  }));
  let priority = '';
  if (m.failed) priority = m.failureReason;
  else if (s.fuel <= 0 && !s.onGround) priority = 'HAJTÓMŰ LEÁLLT · Kényszerleszállás szükséges.';
  else if (s.damage >= 40 && !s.onGround)
    priority = 'ELSŐBBSÉG: HAZATÉRÉS · Sérült gép. Az eredeti célok állapota alább látható.';
  else if (s.fuel < s.spec.fuelCapacity * 0.1 && !s.onGround)
    priority = 'KRITIKUS ÜZEMANYAG · Készülj a hazatérésre.';
  const count = (optional) => {
    const list = rows.filter((o) => !!o.optional === optional);
    return {
      done: list.filter((o) => o.status === 'done').length,
      total: list.length,
      failed: list.filter((o) => o.status === 'failed').length,
    };
  };
  return {
    name: m.spec.name,
    phase: m.phase,
    elapsed: flightClock(s.elapsed || 0),
    rows,
    priority,
    primary: count(false),
    optional: count(true),
  };
}
export function missionGoalsMarkup(card) {
  return [false, true]
    .map((optional) => {
      const rows = card.rows.filter((o) => !!o.optional === optional),
        count = optional ? card.optional : card.primary;
      if (!rows.length) return '';
      return `<section class="mission-goal-group" data-optional="${optional}"><h4>${optional ? 'OPCIONÁLIS' : 'ELSŐDLEGES'} <span>${count.done}/${count.total}</span></h4><ul>${rows.map((o) => `<li class="goal-${o.status}" title="${esc(o.fullText || o.text)}"><span aria-hidden="true">${o.status === 'done' ? '✓' : o.status === 'failed' ? '✕' : '○'}</span><span>${esc(o.text)}</span></li>`).join('')}</ul></section>`;
    })
    .join('');
}

export function configurationIndicators(s) {
  const landing = !!s.approach?.active,
    takeoff = s.onGround && !s.landing?.success && s.throttle > 0.1,
    flap = flapStatus(s),
    speed = s.ias * 3.6,
    target = s.approach?.targetSpeed ?? approachSpeeds(s).target;
  const flag = (active, danger = false) => ({
    active: !!active,
    state: danger ? 'danger' : active ? 'active' : 'off',
  });
  return {
    gear: flag(s.gear, (landing && !s.gear) || (s.gear && speed > 504)),
    flaps: flag(
      s.flaps || flap.fraction > 0.05,
      flap.jammed || (landing && !flap.deployed) || (takeoff && s.speed > 30 && !flap.deployed),
    ),
    airbrake: flag(s.airbrake, s.airbrake && (takeoff || (landing && speed < target + 15))),
    engine: flag(s.throttle > 0.02, !s.onGround && (s.fuel <= 0 || s.enginePower === 0)),
    afterburner: flag(s.spec.hasAB && s.afterburner, landing && s.afterburner && s.spec.hasAB),
    assist: flag(s.assist, !s.assist && !s.onGround && Math.abs(s.g) > s.spec.maxG * 0.8),
    wheelBrake: flag(s.wheelBrakeActive, takeoff && s.wheelBrakeActive),
  };
}
