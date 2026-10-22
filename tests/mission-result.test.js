import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { missionRating } from '../src/missionRating.js';
import {
  FlightReplay,
  replayRotation,
  replayBracket,
  selectHighlights,
  highlightCamera,
} from '../src/flightReplay.js';
import { aircraft } from '../src/aircraftSpec.js';
import { MELODY_BARS, menuArrangement, MENU_TEMPO } from '../src/menuMusic.js';
import { Quat, Vec3, DEG, forward } from '../src/math.js';

const spec = aircraft.find((plane) => plane.id === 'f16');
function logFor(result = 'success', extras = []) {
  return {
    metadata: {
      aircraft: spec,
      mission: { id: 'test', name: 'Test', objective: 'landing' },
      initialUnits: [],
      durationSeconds: 10,
    },
    entries: [
      { t: 0, kind: 'phase', data: { id: 'landing', label: 'Landing' } },
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => ({
        t,
        kind: 'sample',
        data: {
          player: {
            position: { x: t * 10, y: 100, z: 0 },
            velocity: { x: 10, y: 0, z: 0 },
            orientation: new Quat(),
            onGround: false,
            iasKmh: 200,
            damage: 0,
            g: 1,
            flapPosition: 1,
            gear: true,
          },
          stats: { alliedKills: 3 },
        },
      })),
      ...extras,
      { t: 10, kind: 'objectives', data: [{ id: 'land', done: result === 'success' }] },
      { t: 10, kind: 'mission-end', data: { result, score: 800 } },
    ].sort((a, b) => a.t - b.t),
  };
}
test('mission success earns three stars only without recorded quality deductions; allied AI kills are not friendly fire', () => {
  const rating = missionRating(logFor());
  assert.equal(rating.stars, 3);
  assert.equal(rating.percent, 100);
  const hard = missionRating(
    logFor('success', [
      { t: 9, kind: 'touchdown', data: { grade: 'hard', success: true, sinkMps: 4 } },
    ]),
  );
  assert.equal(hard.stars, 2);
  assert.ok(hard.percent < 100 && hard.percent >= 70);
  const severe = missionRating(
    logFor('success', [
      { t: 9, kind: 'touchdown', data: { grade: 'severe', success: true, impactDamage: 35 } },
    ]),
  );
  assert.equal(severe.stars, 1);
  assert.equal(severe.percent, 86);
  for (const result of ['failure', 'crash', 'aborted', 'abandoned']) {
    const failed = missionRating(logFor(result));
    assert.equal(failed.stars, 0);
    assert.equal(failed.percent, 0);
  }
  assert.equal(
    missionRating({ metadata: { result: { result: 'success' } }, entries: [] }).stars,
    0,
  );
});
test('destroying a recorded friendly is a serious error, counted once even if hit events repeat', () => {
  const log = logFor(
    'success',
    [0, 1].map((i) => ({
      t: 5 + i,
      kind: 'combat',
      data: { type: 'target-hit', sourceId: 'PLAYER', targetId: 'ALLY', destroyed: true },
    })),
  );
  log.metadata.initialUnits = [{ id: 'ALLY', team: 'ally' }];
  const rating = missionRating(log);
  assert.equal(rating.stars, 1);
  assert.equal(rating.deductions.find((d) => d.severe).points, 14);
});
test('replay interpolates rotations through north by the short arc, without mutating the recorded quaternions', () => {
  const a = Quat.euler(359 * DEG, 0, 0),
    b = Quat.euler(DEG, 0, 0),
    before = JSON.stringify([a, b]);
  const heading = forward(replayRotation(a, b, 0.5));
  assert.ok(heading.z > 0.9999);
  assert.ok(Math.abs(heading.x) < 1e-8);
  assert.equal(JSON.stringify([a, b]), before);
  const q = replayRotation(a, new Quat(-a.x, -a.y, -a.z, -a.w), 0.5);
  assert.ok(Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) < 1e-10);
});
test('replay reconstructs real vectors, respects projectile lifetimes and world death boundaries, and leaves logs untouched', () => {
  const log = logFor();
  log.entries.push(
    {
      t: 0,
      kind: 'world',
      data: {
        units: [{ id: 'ENEMY', kind: 'air', position: { x: 0, y: 100, z: 300 }, alive: true }],
        projectiles: [],
      },
    },
    {
      t: 0.5,
      kind: 'world',
      data: {
        units: [{ id: 'ENEMY', kind: 'air', position: { x: 100, y: 100, z: 300 }, alive: false }],
        projectiles: [],
      },
    },
    {
      t: 0.1,
      kind: 'projectile-start',
      data: {
        id: 1,
        type: 'gun',
        position: { x: 0, y: 100, z: 0 },
        velocity: { x: 100, y: 0, z: 0 },
      },
    },
    { t: 0.4, kind: 'projectile-end', data: { id: 1 } },
  );
  log.entries.sort((a, b) => a.t - b.t);
  const before = JSON.stringify(log),
    replay = new FlightReplay(log),
    frame = replay.frame(0.25);
  assert.ok(frame.state.position instanceof Vec3);
  assert.equal(frame.state.position.x, 2.5);
  assert.equal(frame.targets[0].position.x, 50);
  assert.equal(frame.targets[0].alive, true);
  assert.equal(replay.frame(0.5).targets[0].alive, false);
  assert.equal(replay.frame(0).weapons.projectiles.length, 0);
  assert.equal(frame.weapons.projectiles.length, 1);
  assert.equal(frame.weapons.projectiles[0].position.x, 15);
  assert.equal(replay.frame(0.4).weapons.projectiles.length, 0);
  assert.equal(JSON.stringify(log), before);
});
test('highlight selection stays inside recorded samples, avoids overlapping gun bursts and never invents a takeoff', () => {
  const log = logFor('success', [
    { t: 4, kind: 'combat', data: { type: 'gun', sourceId: 'PLAYER' } },
    { t: 4.1, kind: 'combat', data: { type: 'gun', sourceId: 'PLAYER' } },
  ]);
  const clips = selectHighlights(log);
  assert.equal(clips.length, 1);
  assert.equal(clips[0].label, 'HARCI JELENET');
  assert.ok(clips.every((clip) => clip.start >= 0 && clip.end <= 10));
  assert.equal(selectHighlights({ entries: [] }).length, 0);
  assert.equal(replayBracket([{ t: 1 }, { t: 2 }], 100).a.t, 2);
  assert.equal(replayBracket([], 1), null);
});
test('menu arrangement preserves all ten folk melody bars and leaves room for a quiet loop tail', () => {
  assert.deepEqual(
    MELODY_BARS.map((bar) => bar.reduce((sum, [, beats]) => sum + beats, 0)),
    [3, 3, 3, 3, 2, 2, 2, 2, 3, 3],
  );
  const score = menuArrangement();
  assert.equal(
    score.events.filter((e) => e.voice === 'horn').length,
    MELODY_BARS.flat().length * 2,
  );
  assert.ok(Math.abs(score.duration - (60 * 60) / MENU_TEMPO) < 1e-9);
  assert.ok(
    score.events.every(
      (event) => event.start >= 0 && event.start + event.duration < score.duration,
    ),
  );
});

test('highlight windows last fifteen seconds even next to takeoff and mission end', () => {
  const log = logFor();
  log.entries = Array.from({ length: 61 }, (_, t) => ({
    t,
    kind: 'sample',
    data: { player: { position: { x: 0, y: 100, z: t * 100 }, onGround: t === 0 } },
  }));
  log.entries.push(
    { t: 30, kind: 'combat', data: { type: 'gun', sourceId: 'PLAYER' } },
    { t: 59.9, kind: 'touchdown', data: {} },
  );
  const clips = selectHighlights(log);
  assert.equal(clips.length, 3);
  assert.ok(clips.every((c) => c.end - c.start === 15 && c.start >= 0 && c.end <= 60));
  assert.equal(clips[0].start, 0);
  assert.equal(clips.at(-1).end, 60);
  for (const duration of [10, 12, 14]) {
    const shorter = logFor();
    shorter.entries = [
      { t: 0, kind: 'sample', data: { player: { position: {} } } },
      { t: duration, kind: 'sample', data: { player: { position: {} } } },
    ];
    assert.equal(selectHighlights(shorter)[0].end, duration);
  }
  const tooShort = logFor();
  tooShort.entries = tooShort.entries.filter((e) => e.t < 10);
  assert.deepEqual(selectHighlights(tooShort), []);
});

test('replay preserves projectile age at first capture so tracer length matches the recorded flight', () => {
  const log = logFor();
  log.entries.push({
    t: 1,
    kind: 'projectile-start',
    data: {
      id: 42,
      type: 'gun',
      age: 0.025,
      position: { x: 0, y: 100, z: 15 },
      velocity: { x: 0, y: 0, z: 1100 },
    },
  });
  log.entries.sort((a, b) => a.t - b.t);
  const projectile = new FlightReplay(log).frame(1.01).weapons.projectiles[0];
  assert.ok(Math.abs(projectile.age - 0.035) < 1e-9);
});

test('real successful convoy sortie retains mission credit and does not count touchdown damage twice', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/convoy-rating.json', import.meta.url)),
  );
  const rating = missionRating(fixture.log, fixture.analysis);
  assert.equal(rating.stars, 1);
  assert.equal(rating.percent, 66);
  assert.equal(rating.completed, 2);
  assert.equal(rating.total, 2);
  assert.equal(rating.percent, 100 - rating.deductions.reduce((n, d) => n + d.points, 0));
  const touchdownOnly = logFor('success', [
    { t: 9, kind: 'touchdown', data: { grade: 'severe', success: true, impactDamage: 40 } },
  ]);
  touchdownOnly.entries.findLast((e) => e.kind === 'sample').data.player.damage = 40;
  const only = missionRating(touchdownOnly);
  assert.equal(only.deductions.length, 1);
  assert.equal(only.deductions[0].reason, 'Súlyos földetérés');
  assert.equal(only.percent, 86);
});

test('real long-range air combat focuses the recorded enemy instead of leaving it kilometres from the camera', () => {
  const log = JSON.parse(
    readFileSync(new URL('./fixtures/air-combat-replay.json', import.meta.url)),
  );
  const replay = new FlightReplay(log),
    clip = replay.clips.find((c) => c.focusId === 'ENEMY-S3-3');
  assert.ok(clip);
  assert.equal(clip.end - clip.start, 15);
  const frame = replay.frame(clip.eventTime - 0.5),
    enemy = frame.targets.find((t) => t.id === clip.focusId);
  assert.equal(enemy.kind, 'air');
  assert.ok(enemy.alive || enemy.falling);
  assert.equal(typeof enemy.flight.spec, 'object');
  assert.equal(enemy.flight.spec.id, enemy.aircraftId);
  const camera = highlightCamera(frame.state, enemy);
  assert.ok(camera.position.distance(enemy.position) < 250);
  assert.ok(camera.position.distance(frame.state.position) > 5000);
  const inverse = new Quat(
    -camera.orientation.x,
    -camera.orientation.y,
    -camera.orientation.z,
    camera.orientation.w,
  );
  const centre = inverse.rotate(enemy.position.clone().sub(camera.position));
  assert.ok(
    centre.z > 0 && Math.abs(centre.x / centre.z) < 0.5 && Math.abs(centre.y / centre.z) < 0.3,
  );
});

test('aircraft without a full recorded physics state still receive smooth world rotations and a renderable model', () => {
  const log = logFor();
  log.entries.push(
    ...[0, 1].map((t) => ({
      t,
      kind: 'world',
      data: {
        projectiles: [],
        units: [
          {
            id: 'JET',
            kind: 'air',
            aircraftId: 'su27',
            alive: true,
            headingDeg: t ? 1 : 359,
            position: { x: 0, y: 100, z: 300 },
            velocity: { x: 0, y: 0, z: 150 },
            flight: null,
          },
        ],
      },
    })),
  );
  log.entries.sort((a, b) => a.t - b.t);
  const target = new FlightReplay(log).frame(0.5).targets[0];
  assert.equal(target.flight.spec.id, 'su27');
  assert.ok(forward(target.flight.orientation).z > 0.9999);
  assert.deepEqual(target.flight.condition.smoke, []);
});
