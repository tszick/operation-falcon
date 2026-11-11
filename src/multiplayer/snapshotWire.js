import { SNAPSHOT_BYTES_LIMIT } from './protocol.js';

// Ordered, lossless deltas. Every number retains its full IEEE-754 precision.
// A new connection gets a keyframe; no simulation or presentation data is omitted.
export const SNAPSHOT_ENCODING = 'delta64-v1';
export function supportsSnapshotCompression() {
  try {
    new DecompressionStream('deflate-raw');
    return true;
  } catch {
    return false;
  }
}
export async function inflateSnapshot(data) {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > SNAPSHOT_BYTES_LIMIT)
    throw new Error('Invalid compressed snapshot');
  if (bytes[0] !== 71) return bytes;
  const reader = new Blob([bytes.subarray(1)])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
    .getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SNAPSHOT_BYTES_LIMIT) throw new Error('Inflated snapshot exceeds wire budget');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}
const SAME = 0,
  NIL = 1,
  FALSE = 2,
  TRUE = 3,
  NUMBER = 4,
  STRING = 5,
  ARRAY = 6,
  OBJECT = 7,
  REMOVE = 8,
  KEYED_ARRAY = 9,
  XOR_NUMBER = 10;
const numberBits = new DataView(new ArrayBuffer(8));
const utf8 = new TextEncoder(),
  text = new TextDecoder('utf-8', { fatal: true });
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const kind = (v) => (v === null || typeof v !== 'object' ? 0 : Array.isArray(v) ? ARRAY : OBJECT);

class Writer {
  constructor() {
    this.bytes = new Uint8Array(4096);
    this.view = new DataView(this.bytes.buffer);
    this.at = 0;
  }
  reserve(n) {
    if (this.at + n > SNAPSHOT_BYTES_LIMIT) throw new Error('Snapshot exceeds wire budget');
    if (this.at + n <= this.bytes.length) return;
    const next = new Uint8Array(
      Math.min(SNAPSHOT_BYTES_LIMIT, Math.max(this.bytes.length * 2, this.at + n)),
    );
    next.set(this.bytes);
    this.bytes = next;
    this.view = new DataView(next.buffer);
  }
  byte(v) {
    this.reserve(1);
    this.bytes[this.at++] = v;
  }
  uint(v) {
    do {
      const b = v & 127;
      v >>>= 7;
      this.byte(b | (v ? 128 : 0));
    } while (v);
  }
  number(v) {
    this.reserve(8);
    this.view.setFloat64(this.at, v, true);
    this.at += 8;
  }
  string(v) {
    const b = utf8.encode(v);
    this.uint(b.length);
    this.reserve(b.length);
    this.bytes.set(b, this.at);
    this.at += b.length;
  }
  count() {
    this.reserve(2);
    const at = this.at;
    this.at += 2;
    return at;
  }
}

export class SnapshotEncoder {
  constructor() {
    this.writer = new Writer();
    this.reset();
  }
  reset() {
    this.previous = undefined;
    this.keys = new Map();
    this.sequence = 0;
  }
  encode(value) {
    if (this.keys.size > 2048) this.reset();
    const w = this.writer;
    w.at = 0;
    w.byte(70);
    w.byte(this.previous === undefined ? 1 : 0);
    w.uint(++this.sequence);
    this.previous = this.patch(w, value, this.previous, 0);
    return w.bytes.slice(0, w.at);
  }
  key(w, key) {
    let id = this.keys.get(key);
    if (id === undefined) {
      id = this.keys.size;
      this.keys.set(key, id);
      w.uint(id * 2 + 1);
      w.string(key);
    } else w.uint(id * 2);
  }
  patch(w, value, previous, depth) {
    if (depth > 64) throw new Error('Snapshot too deep');
    if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) value = null;
    const type = kind(value);
    if (!type) {
      if (Object.is(value, previous)) {
        w.byte(SAME);
        return previous;
      }
      if (value === null) w.byte(NIL);
      else if (value === false) w.byte(FALSE);
      else if (value === true) w.byte(TRUE);
      else if (typeof value === 'number') {
        if (typeof previous === 'number') {
          numberBits.setFloat64(0, previous, true);
          const low = numberBits.getUint32(0, true),
            high = numberBits.getUint32(4, true);
          numberBits.setFloat64(0, value, true);
          const a = low ^ numberBits.getUint32(0, true),
            b = high ^ numberBits.getUint32(4, true);
          let mask = 0,
            count = 0;
          for (let i = 0; i < 8; i++)
            if (((i < 4 ? a : b) >>> ((i % 4) * 8)) & 255) {
              mask |= 1 << i;
              count++;
            }
          if (count < 7) {
            w.byte(XOR_NUMBER);
            w.byte(mask);
            for (let i = 0; i < 8; i++)
              if (mask & (1 << i)) w.byte(((i < 4 ? a : b) >>> ((i % 4) * 8)) & 255);
          } else {
            w.byte(NUMBER);
            w.number(value);
          }
        } else {
          w.byte(NUMBER);
          w.number(value);
        }
      } else if (typeof value === 'string') {
        w.byte(STRING);
        w.string(value);
      } else throw new Error('Unsupported snapshot value');
      return value;
    }
    const compatible = kind(previous) === type;
    const mark = w.at;
    if (
      type === ARRAY &&
      compatible &&
      value.length &&
      value.every(
        (v) => v && typeof v === 'object' && (typeof v.id === 'string' || typeof v.id === 'number'),
      )
    ) {
      const lookup = new Map(previous.map((v, i) => [v?.id, i]));
      w.byte(KEYED_ARRAY);
      w.uint(value.length);
      const next = value.map((item) => {
        const index = lookup.get(item.id);
        w.uint(index === undefined ? 0 : index + 1);
        return this.patch(w, item, index === undefined ? undefined : previous[index], depth + 1);
      });
      return next;
    }
    w.byte(type);
    if (type === ARRAY) w.uint(value.length);
    const countAt = w.count();
    let count = 0,
      next;
    const update = (key, item) => {
      const start = w.at;
      if (type === ARRAY) w.uint(key);
      else this.key(w, key);
      const patchAt = w.at;
      const old = compatible ? previous[key] : undefined;
      const result = this.patch(w, item, old, depth + 1);
      if (w.at === patchAt + 1 && w.bytes[patchAt] === SAME) {
        w.at = start;
        return;
      }
      next ??=
        type === ARRAY
          ? compatible
            ? previous.slice(0, value.length)
            : []
          : compatible
            ? { ...previous }
            : {};
      next[key] = result;
      count++;
    };
    if (type === ARRAY) {
      for (let i = 0; i < value.length; i++) update(i, value[i]);
    } else {
      for (const key of Object.keys(value)) if (value[key] !== undefined) update(key, value[key]);
      if (compatible)
        for (const key of Object.keys(previous))
          if (value[key] === undefined) {
            this.key(w, key);
            w.byte(REMOVE);
            next ??= { ...previous };
            delete next[key];
            count++;
          }
    }
    if (count > 65535) throw new Error('Snapshot too wide');
    if (!count && compatible && (type !== ARRAY || previous.length === value.length)) {
      w.at = mark;
      w.byte(SAME);
      return previous;
    }
    w.view.setUint16(countAt, count, true);
    next ??= type === ARRAY ? (compatible ? previous.slice(0, value.length) : []) : {};
    if (type === ARRAY) next.length = value.length;
    return next;
  }
}

export class SnapshotDecoder {
  constructor() {
    this.reset();
  }
  reset() {
    this.previous = undefined;
    this.keys = [];
    this.sequence = 0;
  }
  decode(data) {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > SNAPSHOT_BYTES_LIMIT)
      throw new Error('Invalid snapshot packet');
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.at = 0;
    if (this.byte() !== 70) throw new Error('Invalid snapshot header');
    const reset = this.byte(),
      sequence = this.uint();
    if (reset > 1 || (reset && sequence !== 1)) throw new Error('Invalid keyframe');
    if (reset) this.reset();
    if (sequence !== this.sequence + 1) throw new Error('Missing snapshot delta');
    const value = this.patch(this.previous, 0);
    if (this.at !== bytes.length || !value || value.type !== 'snapshot')
      throw new Error('Invalid snapshot payload');
    this.previous = value;
    this.sequence = sequence;
    this.bytes = this.view = null;
    return value;
  }
  byte() {
    if (this.at >= this.bytes.length) throw new Error('Truncated snapshot');
    return this.bytes[this.at++];
  }
  uint() {
    let value = 0;
    for (let shift = 0; shift <= 28; shift += 7) {
      const b = this.byte();
      value += (b & 127) * 2 ** shift;
      if (!(b & 128)) {
        if (value > 0xffffffff) break;
        return value;
      }
    }
    throw new Error('Invalid snapshot integer');
  }
  string() {
    const size = this.uint();
    if (size > this.bytes.length - this.at) throw new Error('Invalid snapshot string');
    const v = text.decode(this.bytes.subarray(this.at, this.at + size));
    this.at += size;
    return v;
  }
  key() {
    const token = this.uint(),
      id = Math.floor(token / 2);
    if (token & 1) {
      if (id !== this.keys.length || id >= 4096) throw new Error('Invalid snapshot dictionary');
      const key = this.string();
      if (forbidden.has(key)) throw new Error('Invalid snapshot key');
      this.keys.push(key);
    }
    if (id >= this.keys.length) throw new Error('Unknown snapshot key');
    return this.keys[id];
  }
  patch(previous, depth) {
    if (depth > 64) throw new Error('Snapshot too deep');
    const type = this.byte();
    if (type === SAME) {
      if (previous === undefined) throw new Error('Missing snapshot baseline');
      return previous;
    }
    if (type === NIL) return null;
    if (type === FALSE) return false;
    if (type === TRUE) return true;
    if (type === NUMBER) {
      if (this.at + 8 > this.bytes.length) throw new Error('Truncated number');
      const v = this.view.getFloat64(this.at, true);
      this.at += 8;
      if (!Number.isFinite(v)) throw new Error('Invalid number');
      return v;
    }
    if (type === XOR_NUMBER) {
      if (typeof previous !== 'number') throw new Error('Missing number baseline');
      numberBits.setFloat64(0, previous, true);
      const mask = this.byte();
      for (let i = 0; i < 8; i++)
        if (mask & (1 << i)) numberBits.setUint8(i, numberBits.getUint8(i) ^ this.byte());
      const v = numberBits.getFloat64(0, true);
      if (!Number.isFinite(v)) throw new Error('Invalid number');
      return v;
    }
    if (type === STRING) return this.string();
    if (type === KEYED_ARRAY) {
      if (!Array.isArray(previous)) throw new Error('Missing array baseline');
      const length = this.uint();
      if (length > 8192) throw new Error('Snapshot array too long');
      return Array.from({ length }, () => {
        const index = this.uint();
        if (index > previous.length) throw new Error('Invalid array baseline');
        return this.patch(index ? previous[index - 1] : undefined, depth + 1);
      });
    }
    if (type !== ARRAY && type !== OBJECT) throw new Error('Invalid snapshot operation');
    const compatible = kind(previous) === type;
    const length = type === ARRAY ? this.uint() : 0;
    if (length > 8192) throw new Error('Snapshot array too long');
    const count = this.byte() | (this.byte() << 8);
    const next =
      type === ARRAY
        ? compatible
          ? previous.slice(0, length)
          : []
        : compatible
          ? { ...previous }
          : {};
    if (type === ARRAY) next.length = length;
    for (let i = 0; i < count; i++) {
      const key = type === ARRAY ? this.uint() : this.key();
      if (type === ARRAY && key >= length) throw new Error('Invalid snapshot index');
      if (this.bytes[this.at] === REMOVE) {
        if (type === ARRAY) throw new Error('Invalid array deletion');
        this.at++;
        delete next[key];
      } else next[key] = this.patch(compatible ? previous[key] : undefined, depth + 1);
    }
    return next;
  }
}
