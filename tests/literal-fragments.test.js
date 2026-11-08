import test from 'node:test';
import assert from 'node:assert/strict';
import { LiteralFragments } from '../src/literalFragments.js';
import messages from '../src/locales/messages.json' with { type: 'json' };
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function reference(values, input, replacement) {
  const literals = [...new Set(values)].filter(Boolean).sort((a, b) => b.length - a.length);
  return literals.length
    ? input.replace(new RegExp(literals.map(escape).join('|'), 'gu'), replacement)
    : input;
}
test('literal buckets preserve leftmost longest matches, metacharacters, offsets and Unicode', () => {
  const literals = [
    'radar',
    'radar lock',
    'lock',
    'rádió',
    'a+b',
    'a.b',
    '[x]',
    '🛩️',
    'x',
    'xy',
    'xy',
    '',
  ];
  const matcher = new LiteralFragments(literals);
  const replace = (match, offset) => `<${offset}:${match}>`;
  for (const text of [
    'radar lock radarlock',
    'rádió a+b a.b [x]',
    '🛩️:xyx',
    'unmatched text',
    '',
    'x',
    'xy',
  ])
    assert.equal(matcher.replace(text, replace), reference(literals, text, replace));
  assert.equal(new LiteralFragments([]).replace('unchanged', replace), 'unchanged');
});
test('fragment matching preserves the catalog alternation and word-boundary replacement semantics', () => {
  const values = [
    ...new Set(
      Object.entries(messages).flatMap(([source, entry]) =>
        [source.replace(/\s+/g, ' ').trim(), entry.hu, entry.en].flatMap((s) => [
          s,
          s.toLocaleUpperCase('hu'),
        ]),
      ),
    ),
  ].filter(
    (s) =>
      (s.length >= 4 || (s.length === 3 && s === s.toLocaleUpperCase('hu'))) && !s.includes('{{'),
  );
  const matcher = new LiteralFragments(values);
  const pattern = new RegExp(
    values
      .toSorted((a, b) => b.length - a.length)
      .map(escape)
      .join('|'),
    'gu',
  );
  const replace = (part, offset, text) => {
    const before = text[offset - 1],
      after = text[offset + part.length];
    return (before && /[\p{L}\p{N}]/u.test(before)) || (after && /[\p{L}\p{N}]/u.test(after))
      ? part
      : `<${part}>`;
  };
  let seed = 41;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let i = 0; i < 2000; i++) {
    const a = values[Math.floor(random() * values.length)],
      b = values[Math.floor(random() * values.length)];
    const input = `US-BMR-101 🛩️ ${i % 2 ? 'prefix' : ''}${a} / ${b}${i % 3 ? 'suffix' : ''} — 75%`;
    assert.equal(matcher.replace(input, replace), input.replace(pattern, replace));
  }
});
