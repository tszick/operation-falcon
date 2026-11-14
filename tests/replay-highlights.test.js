import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FlightReplay, highlightCamera } from '../src/flightReplay.js';
import { MissionResultView } from '../src/ui/missionResult.js';
import { forward } from '../src/math.js';
const fixture = () =>
  JSON.parse(readFileSync(new URL('./fixtures/strike-highlights.json', import.meta.url), 'utf8'));
test('successful silo strike selects takeoff, complete missile hit, both destroyed objectives and landing without launch duplicates', () => {
  const replay = new FlightReplay(fixture()),
    clips = replay.clips;
  assert.equal(clips.length, 5);
  assert.deepEqual(
    clips.map((c) => c.focusId),
    [null, 'SILO-GUARD', 'SILO', 'JAMMER', null],
  );
  const missile = clips.find((c) => c.focusId === 'SILO-GUARD');
  assert.equal(missile.projectileId, 2);
  assert.ok(missile.start < 31.6);
  assert.ok(missile.end > 61.6083 + 3);
  assert.ok(missile.end - missile.start > 30);
  assert.ok(clips.every((c) => c.kind !== 'launch'));
  assert.ok(replay.frame(61).weapons.projectiles.some((p) => p.id === 2));
  assert.ok(replay.frame(62).weapons.effects.length);
});
test('ground objective camera frames the real object and remains on its explosion after destruction', () => {
  const replay = new FlightReplay(fixture());
  for (const clip of replay.clips.filter((c) => c.kind === 'destroy'))
    for (const time of [clip.eventTime - 1, clip.eventTime + 1]) {
      const f = replay.frame(time),
        focus = f.targets.find((t) => t.id === clip.focusId),
        camera = highlightCamera(f.state, focus, {
          clip,
          time,
          projectiles: f.weapons.projectiles,
        });
      assert.ok(camera.position.distance(focus.position) < 500);
      assert.ok(
        forward(camera.orientation).dot(focus.position.clone().sub(camera.position).normalize()) >
          0.97,
      );
    }
});
test('missile tracking camera follows the actual projectile rather than an empty launch point', () => {
  const replay = new FlightReplay(fixture()),
    clip = replay.clips.find((c) => c.projectileId === 2),
    time = 45,
    f = replay.frame(time),
    missile = f.weapons.projectiles.find((p) => p.id === 2),
    camera = highlightCamera(
      f.state,
      f.targets.find((t) => t.id === clip.focusId),
      { clip, time, projectiles: f.weapons.projectiles },
    );
  assert.ok(camera.position.distance(missile.position) < 100);
});
test('result playback visits every clip and continues through multiple loops and pause/resume', () => {
  const view = Object.assign(Object.create(MissionResultView.prototype), {
      replay: new FlightReplay(fixture()),
      clipIndex: 0,
      clipTime: 0,
      moving: true,
      caption: { textContent: '' },
      renderer: { w: 1200, h: 800, render() {} },
    }),
    seen = new Set();
  let cycles = 0,
    last = 0;
  for (let i = 0; i < 1500; i++) {
    view.render(0.25);
    seen.add(view.clipIndex);
    if (view.clipIndex < last) cycles++;
    last = view.clipIndex;
  }
  assert.equal(seen.size, 5);
  assert.ok(cycles >= 2);
  view.moving = false;
  const frozen = [view.clipIndex, view.clipTime];
  view.render(10);
  assert.deepEqual([view.clipIndex, view.clipTime], frozen);
  view.moving = true;
  view.render(0.25);
  assert.notEqual(view.clipTime, frozen[1]);
});
