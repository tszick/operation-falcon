import { recoveryComplete } from './navalOps.js';
// Shared objective snapshots used by the simulation, HUD and recorder.
export function objectiveRows(s, m, targets = []) {
  const landed = m.complete || !!recoveryComplete(s),
    civil = targets.find((t) => t.civilian);
  let rows = (m.objectives || []).map((o) => ({
    ...o,
    status: o.status === 'failed' ? 'failed' : o.done ? 'done' : 'pending',
  }));
  if (!rows.length) {
    if (m.spec.objective === 'landing')
      rows = [{ id: 'landing', text: 'Földetérés és megállás', done: landed }];
    else if (m.spec.objective === 'escort')
      rows = [
        {
          id: 'civil-lock',
          text: 'Civil gép békés elfogása',
          done: m.civilIntercepted || civil?.departedAirspace,
        },
        {
          id: 'civil-exit',
          text: 'Civil gép sértetlenül távozik',
          done: !!civil?.departedAirspace,
        },
        { id: 'landing', text: 'Hazatérés és leszállás', done: landed },
      ];
    else
      rows = [
        { id: 'main', text: 'Elsődleges feladat teljesítése', done: !!m.objectiveComplete },
        { id: 'landing', text: 'Hazatérés és leszállás', done: landed },
      ];
  }
  return rows;
}
