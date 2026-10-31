import { attitude, DEG, clamp } from './math.js';
// Conservative test cards: envelope checks, not attempts at design records.
export function updateFlightTest(s, m, w) {
  const p = s.spec.testProfile,
    t = (m.flightTest ??= {
      takeoff: false,
      level: 0,
      left: 0,
      right: 0,
      lastTime: s.elapsed,
      points: [],
    });
  const dt = clamp(s.elapsed - t.lastTime, 0, 0.25);
  t.lastTime = s.elapsed;
  const a = attitude(s.orientation),
    bank = a.bank / DEG,
    ias = s.ias * 3.6;
  if (s.airborne && !s.onGround && s.agl > 40) t.takeoff = true;
  const nearAltitude = Math.abs(s.position.y - p.altitude) <= 150,
    nearSpeed = Math.abs(ias - p.ias) <= 40;
  const configured = !s.gear && (s.flapPosition || 0) < 0.05 && !s.airbrake;
  const checkpoint = (name, valid, duration) => {
    if (t[name] >= duration) return true;
    t[name] = valid ? t[name] + dt : 0;
    if (t[name] >= duration) {
      t.points.push(name);
      w?.emit?.({ type: 'flight-test-point', point: name, aircraftId: s.spec.id, time: s.elapsed });
      return true;
    }
    return false;
  };
  let stage = 'takeoff';
  if (t.takeoff) {
    if (
      !checkpoint(
        'level',
        !s.onGround &&
          nearAltitude &&
          nearSpeed &&
          configured &&
          Math.abs(bank) < 8 &&
          Math.abs(s.velocity.y) < 4,
        12,
      )
    )
      stage = 'level';
    else if (
      !checkpoint(
        'left',
        !s.onGround && nearAltitude && nearSpeed && configured && bank <= -20 && bank >= -40,
        3,
      )
    )
      stage = 'left';
    else if (
      !checkpoint(
        'right',
        !s.onGround && nearAltitude && nearSpeed && configured && bank >= 20 && bank <= 40,
        3,
      )
    )
      stage = 'right';
    else stage = 'return';
  }
  m.objectiveComplete = stage === 'return';
  const landed =
    m.objectiveComplete && s.airborne && s.onGround && s.landing?.success && s.speed < 5;
  m.objectives = [
    { id: 'test-takeoff', text: 'Berepülés: biztonságos felszállás', done: t.takeoff },
    {
      id: 'test-level',
      text: 'Stabil repülés: ' + p.altitude + ' m · IAS ' + p.ias + ' km/h · 12 s',
      done: t.level >= 12,
    },
    { id: 'test-left', text: 'Bal forduló: 20–40° bedöntés, 3 s', done: t.left >= 3 },
    { id: 'test-right', text: 'Jobb forduló: 20–40° bedöntés, 3 s', done: t.right >= 3 },
    { id: 'landing', text: 'Hazatérés, leszállás és megállás', done: !!landed },
  ];
  if (landed) {
    m.complete = true;
    m.score = Math.max(0, Math.round(2000 - s.elapsed * 0.2 - s.damage * 5));
    m.setPhase(
      'complete',
      'BEREPÜLÉS TELJESÍTVE',
      'A tesztpontokat teljesítetted, a gépet biztonságosan hazahoztad.',
    );
    return;
  }
  const target = p.altitude + ' m ±150 m · IAS ' + p.ias + ' km/h ±40 km/h';
  const instructions = {
    takeoff: 'Teljes gáz; felszállás után futó és fékszárny be.',
    level: target + ' · szinttartás 12 s, bedöntés <8°, függőleges sebesség <4 m/s.',
    left: target + ' · bal bedöntés 20–40° legalább 3 s.',
    right: target + ' · jobb bedöntés 20–40° legalább 3 s.',
    return: 'Térj a BASE felé; N: leszállási segéd. Szállj le és állj meg.',
  };
  m.setPhase(
    'test-' + stage,
    'BEREPÜLÉS · ' +
      {
        takeoff: 'FELSZÁLLÁS',
        level: 'STABIL REPÜLÉS',
        left: 'BAL FORDULÓ',
        right: 'JOBB FORDULÓ',
        return: 'HAZATÉRÉS',
      }[stage],
    instructions[stage],
  );
}
