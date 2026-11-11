import { deflateRawSync } from 'node:zlib';

// Compress once per room broadcast, then share the same immutable frame with all peers.
export function compressSnapshot(packet) {
  const compressed = deflateRawSync(packet, { level: 1 });
  if (compressed.byteLength + 1 >= packet.byteLength) return packet;
  const out = new Uint8Array(compressed.byteLength + 1);
  out[0] = 71;
  out.set(compressed, 1);
  return out;
}
