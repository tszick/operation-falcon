// Leftmost, longest literal matching without compiling a large alternation
// lazily on the first untranslated HUD string. Two UTF-16 code units select a
// small candidate bucket; longest-first order preserves RegExp alternative order.
export class LiteralFragments {
  constructor(values) {
    this.buckets = new Map();
    this.singles = new Map();
    for (const value of [...new Set(values)].filter(Boolean).sort((a, b) => b.length - a.length)) {
      if (value.length === 1) {
        this.singles.set(value, value);
        continue;
      }
      const key = value.charCodeAt(0) * 65536 + value.charCodeAt(1);
      let bucket = this.buckets.get(key);
      if (!bucket) this.buckets.set(key, (bucket = []));
      bucket.push(value);
    }
  }
  replace(input, replacement) {
    let offset = 0,
      copied = 0;
    const pieces = [];
    while (offset < input.length) {
      const key = input.charCodeAt(offset) * 65536 + input.charCodeAt(offset + 1);
      let match;
      const candidates = this.buckets.get(key);
      if (candidates)
        for (const candidate of candidates)
          if (input.startsWith(candidate, offset)) {
            match = candidate;
            break;
          }
      match ||= this.singles.get(input[offset]);
      if (match) {
        pieces.push(input.slice(copied, offset), String(replacement(match, offset, input)));
        offset += match.length;
        copied = offset;
      } else offset += input.codePointAt(offset) > 0xffff ? 2 : 1;
    }
    if (!pieces.length) return input;
    pieces.push(input.slice(copied));
    return pieces.join('');
  }
}
