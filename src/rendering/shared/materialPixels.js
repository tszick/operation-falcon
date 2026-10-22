export function materialPixels(kind, size = 256) {
  const data = new Uint8Array(size * size * 4);
  let seed = 5219;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const u = x / size,
        v = y / size,
        grain = seed / 4294967296 - 0.5,
        field =
          kind === 'camo' || kind.startsWith('terrain')
            ? Math.sin(u * Math.PI * 4 + Math.sin(v * Math.PI * 4)) +
              Math.cos(v * Math.PI * 6 + Math.sin(u * Math.PI * 2))
            : 0;
      let c;
      if (kind === 'camo')
        c = field > 0.6 ? [96, 103, 65] : field < -0.55 ? [48, 59, 39] : [126, 124, 84];
      else if (kind.startsWith('terrain')) {
        const n = 140 + field * 14 + grain * 24;
        if (kind === 'terrain-sand') {
          const ripple = Math.sin((u * 24 + Math.sin(v * 6) * 0.6) * Math.PI * 2) * 9;
          c = [150 + ripple + field * 10 + grain * 12, 145 + ripple + field * 8, 136 + ripple];
        } else if (kind === 'terrain-rock') {
          const strata = Math.sin((v * 18 + Math.sin(u * 9) * 0.3) * Math.PI * 2) * 13,
            crack = Math.abs(Math.sin(u * 29 + v * 17)) < 0.06 ? -25 : 0;
          c = [n + strata + crack, n + strata + crack - 3, n + strata + crack - 5];
        } else if (kind === 'terrain-sea') {
          const wave = Math.sin(u * 31 + Math.sin(v * 9)) * 5 + Math.sin(v * 39 + u * 7) * 3;
          c = [135 + wave, 148 + wave, 157 + wave];
        } else if (kind === 'terrain-snow') {
          const drift = Math.sin(u * 17 + Math.sin(v * 12)) * 4;
          c = [183 + drift + grain * 11, 187 + drift + grain * 9, 192 + drift + grain * 7];
        } else c = [n, n, n];
      } else if (kind === 'asphalt') c = [43 + grain * 12, 46 + grain * 12, 48 + grain * 12];
      else if (kind === 'hangar') {
        const door = u > 0.12 && u < 0.88 && v > 0.09 && v < 0.83,
          rib = (u * 64) % 1 < 0.16 ? -19 : 0;
        c = door ? [66 + rib, 76 + rib, 81 + rib] : [157 + rib, 163 + rib, 164 + rib];
        if (door && ((v * 12) % 1 < 0.035 || Math.abs(u - 0.5) < 0.006)) c = [28, 35, 39];
        if (
          ((Math.abs(u - 0.12) < 0.012 || Math.abs(u - 0.88) < 0.012) && v > 0.075 && v < 0.85) ||
          (Math.abs(v - 0.09) < 0.012 && u > 0.11 && u < 0.89)
        )
          c = [191, 195, 191];
        if (v > 0.76 && v < 0.8 && (Math.abs(u - 0.48) < 0.009 || Math.abs(u - 0.52) < 0.009))
          c = [187, 171, 106];
      } else if (kind === 'aircraft') {
        const panel = x % 64 < 1 || y % 128 < 1;
        c = panel ? [98, 106, 114] : [162, 170, 177];
      } else c = [159, 161, 155];
      const i = (y * size + x) * 4;
      for (let k = 0; k < 3; k++)
        data[i + k] = Math.max(0, Math.min(255, c[k] + grain * (kind === 'concrete' ? 18 : 7)));
      data[i + 3] = 255;
    }
  return data;
}
