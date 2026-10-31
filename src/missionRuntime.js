import { updateBattlefieldRuntime } from './battlefieldScenario.js';
import { updateMirroredRuntime } from './sideRuntime.js';
import { updateIronVeil } from './ironVeil.js';
import { launchBallistic } from './ballisticFlight.js';
export function updateMissionRuntime(s, m, targets, w) {
  if (m.spec.battlefield) updateBattlefieldRuntime(s, m, targets, w);
  else if (m.spec.mirrored) updateMirroredRuntime(s, m, targets, w);
  else if (m.spec.objective === 'iron-veil') updateIronVeil(s, m, targets, w);
  if (m.spec.naval) m.wave = 1;
  if (m.spec.objective === 'defend-city') {
    const pending = targets.filter((t) => t.pending),
      first = targets.filter((t) => t.wave === 1),
      ready = s.elapsed >= 240 || (first.length && first.every((t) => !t.alive && !t.falling));
    if (pending.length && ready) {
      for (const t of pending) {
        t.pending = false;
        t.alive = true;
      }
      m.wave = 2;
      w.emit?.({ type: 'mission-wave', wave: 2, time: s.elapsed });
    } else m.wave = pending.length ? 1 : 2;
  }
  if (m.spec.objective === 'ballistic-strike') {
    const silo = targets.find((t) => t.id === 'SILO'),
      base = targets.find((t) => t.id === (silo?.targetId || 'BASE'));
    if (silo?.alive && !silo.launched && s.elapsed >= silo.launchAt && base?.alive) {
      silo.launched = true;
      targets.push(launchBallistic(silo, base));
      w.emit?.({
        type: 'ballistic-launch',
        sourceId: silo.id,
        targetId: base.id,
        time: s.elapsed,
        position: silo.position.clone(),
      });
    }
    const missile = targets.find((t) => t.type === 'ballistic');
    if (
      missile?.alive &&
      missile.ballistic.age < missile.ballistic.boost &&
      w.trails &&
      s.elapsed >= (missile.trailAt || 0)
    ) {
      w.trails.push({
        from: missile.previousPosition.clone(),
        to: missile.position.clone(),
        velocity: missile.velocity.clone().normalize(),
        life: 4,
        maxLife: 4,
      });
      missile.trailAt = s.elapsed + 0.05;
    }
    if (missile?.impacted && !missile.impactApplied) {
      missile.impactApplied = true;
      if (base?.alive && missile.position.distance(base.position) < 700) {
        base.health = 0;
        base.damage = 100;
        base.alive = false;
        base.impactReady = true;
      }
      w.emit?.({
        type: 'ballistic-impact',
        targetId: base?.id,
        time: s.elapsed,
        position: missile.position.clone(),
      });
    }
  }
}
