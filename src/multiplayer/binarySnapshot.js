import { PROJECTILE_LIMIT, SNAPSHOT_BYTES_LIMIT } from './protocol.js';
import { expandSnapshot } from './snapshotWire.js';
const MAGIC = 0x314c4146,
  HEADER_BYTES = 8,
  RECORD_BYTES = 75;
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true });
// Each frame owns its dictionary and all Float64 values. No preceding frame,
// session cache or lossy numeric conversion is required to decode a projectile.
export function encodeSnapshot(message) {
  const shots = message.combat.projectiles;
  if (!shots.length) return JSON.stringify(message);
  if (message.combat.projectileFormat !== 1 || shots.length > PROJECTILE_LIMIT)
    throw new Error('Unsupported projectile encoding');
  const dictionary = [],
    indexes = new Map();
  const index = (value) => {
    if (value == null) return 0;
    let id = indexes.get(value);
    if (id === undefined) {
      id = dictionary.length + 1;
      dictionary.push(value);
      indexes.set(value, id);
    }
    return id;
  };
  const references = shots.map((p) => [
    index(p[1]),
    index(p[2]),
    index(p[3]),
    index(p[4]),
    index(p[5]),
  ]);
  const combat = {
    ...message.combat,
    projectileFormat: 2,
    projectileCount: shots.length,
    projectileDictionary: dictionary,
  };
  delete combat.projectiles;
  const json = encoder.encode(JSON.stringify({ ...message, combat }));
  const bytes = new Uint8Array(HEADER_BYTES + json.length + shots.length * RECORD_BYTES);
  if (bytes.length > SNAPSHOT_BYTES_LIMIT) throw new Error('Snapshot exceeds network budget');
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, json.length, true);
  bytes.set(json, HEADER_BYTES);
  let offset = HEADER_BYTES + json.length;
  for (let n = 0; n < shots.length; n++) {
    const p = shots[n];
    view.setFloat64(offset, p[0], true);
    offset += 8;
    for (const id of references[n]) {
      view.setUint16(offset, id, true);
      offset += 2;
    }
    for (let i = 6; i < 13; i++) {
      view.setFloat64(offset, p[i], true);
      offset += 8;
    }
    view.setUint8(offset++, Number(p[13]) | (Number(p[14]) << 1));
  }
  return bytes;
}
export function decodeSnapshot(data) {
  if (typeof data === 'string') return expandSnapshot(JSON.parse(data));
  const bytes =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : null;
  if (!bytes || bytes.length < HEADER_BYTES || bytes.length > SNAPSHOT_BYTES_LIMIT)
    throw new Error('Invalid binary snapshot size');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    jsonLength = view.getUint32(4, true);
  if (view.getUint32(0, true) !== MAGIC || jsonLength > bytes.length - HEADER_BYTES)
    throw new Error('Invalid binary snapshot header');
  const message = JSON.parse(
    decoder.decode(bytes.subarray(HEADER_BYTES, HEADER_BYTES + jsonLength)),
  );
  const combat = message?.combat,
    count = combat?.projectileCount,
    dictionary = combat?.projectileDictionary;
  if (
    combat?.projectileFormat !== 2 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > PROJECTILE_LIMIT ||
    !Array.isArray(dictionary) ||
    dictionary.length > PROJECTILE_LIMIT * 5 ||
    !dictionary.every((s) => typeof s === 'string' && s.length <= 128) ||
    combat.projectiles !== undefined ||
    HEADER_BYTES + jsonLength + count * RECORD_BYTES !== bytes.length
  )
    throw new Error('Invalid binary projectile frame');
  const projectiles = [];
  let offset = HEADER_BYTES + jsonLength;
  for (let n = 0; n < count; n++) {
    const p = [view.getFloat64(offset, true)];
    offset += 8;
    for (let i = 0; i < 5; i++) {
      const id = view.getUint16(offset, true);
      offset += 2;
      if (id > dictionary.length) throw new Error('Invalid projectile dictionary index');
      p.push(id === 0 ? null : dictionary[id - 1]);
    }
    for (let i = 0; i < 7; i++) {
      p.push(view.getFloat64(offset, true));
      offset += 8;
    }
    const flags = view.getUint8(offset++);
    if (flags > 3) throw new Error('Invalid projectile flags');
    p.push(!!(flags & 1), !!(flags & 2));
    projectiles.push(p);
  }
  const expandedCombat = { ...combat, projectileFormat: 1, projectiles };
  delete expandedCombat.projectileCount;
  delete expandedCombat.projectileDictionary;
  return expandSnapshot({ ...message, combat: expandedCombat });
}
