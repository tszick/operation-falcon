import test from 'node:test';
import assert from 'node:assert/strict';
import { RetainedSvg } from '../src/rendering/retainedSvg.js';
test('retained SVG replays static geometry but redraws after layout changes, damage mutations and cache resets', () => {
  const cache = new RetainedSvg(),
    svg = {},
    other = {},
    replayed = [];
  let draws = 0;
  const ctx = {
      capture(draw) {
        draw();
        return { vertices: [draws], batches: [] };
      },
      replay(record) {
        replayed.push(record);
      },
    },
    draw = () => draws++;
  cache.paint(ctx, svg, 'size:1', draw);
  for (let i = 0; i < 30; i++) cache.paint(ctx, svg, 'size:1', draw);
  assert.equal(draws, 1);
  assert.equal(new Set(replayed).size, 1);
  cache.paint(ctx, svg, 'size:2', draw);
  assert.equal(draws, 2);
  cache.paint(ctx, other, 'size:2', draw);
  assert.equal(draws, 3);
  cache.invalidate(svg);
  cache.paint(ctx, svg, 'size:2', draw);
  assert.equal(draws, 4);
  cache.paint(ctx, other, 'size:2', draw);
  assert.equal(draws, 4);
  cache.clear();
  cache.paint(ctx, other, 'size:2', draw);
  assert.equal(draws, 5);
});

test('changing an unrelated panel preserves the SVG, while an ancestor style invalidates its descendants', () => {
  const cache = new RetainedSvg(),
    svg = {},
    context = {
      capture(draw) {
        draw();
        return { vertices: [], batches: [] };
      },
      replay() {},
    };
  let calls = 0;
  const draw = () => calls++;
  cache.paint(context, svg, 'same', draw);
  cache.invalidateTree({ querySelectorAll: () => [] });
  cache.paint(context, svg, 'same', draw);
  assert.equal(calls, 1);
  cache.invalidateTree({ querySelectorAll: () => [svg] });
  cache.paint(context, svg, 'same', draw);
  assert.equal(calls, 2);
});
