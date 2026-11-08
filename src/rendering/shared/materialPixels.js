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
      let r, g, b;
      if (kind === 'camo') {
        r = field > 0.6 ? 96 : field < -0.55 ? 48 : 126;
        g = field > 0.6 ? 103 : field < -0.55 ? 59 : 124;
        b = field > 0.6 ? 65 : field < -0.55 ? 39 : 84;
      } else if (kind.startsWith('terrain')) {
        const n = 140 + field * 14 + grain * 24;
        if (kind === 'terrain-sand') {
          const ripple = Math.sin((u * 24 + Math.sin(v * 6) * 0.6) * Math.PI * 2) * 9;
          r = 150 + ripple + field * 10 + grain * 12;
          g = 145 + ripple + field * 8;
          b = 136 + ripple;
        } else if (kind === 'terrain-rock') {
          const strata = Math.sin((v * 18 + Math.sin(u * 9) * 0.3) * Math.PI * 2) * 13,
            crack = Math.abs(Math.sin(u * 29 + v * 17)) < 0.06 ? -25 : 0;
          r = n + strata + crack;
          g = n + strata + crack - 3;
          b = n + strata + crack - 5;
        } else if (kind === 'terrain-sea') {
          const wave = Math.sin(u * 31 + Math.sin(v * 9)) * 5 + Math.sin(v * 39 + u * 7) * 3;
          r = 135 + wave;
          g = 148 + wave;
          b = 157 + wave;
        } else if (kind === 'terrain-snow') {
          const drift = Math.sin(u * 17 + Math.sin(v * 12)) * 4;
          r = 183 + drift + grain * 11;
          g = 187 + drift + grain * 9;
          b = 192 + drift + grain * 7;
        } else {
          r = n;
          g = n;
          b = n;
        }
      } else if (kind === 'asphalt') {
        r = 43 + grain * 12;
        g = 46 + grain * 12;
        b = 48 + grain * 12;
      } else if (kind === 'hangar') {
        const door = u > 0.12 && u < 0.88 && v > 0.09 && v < 0.83,
          rib = (u * 64) % 1 < 0.16 ? -19 : 0;
        r = (door ? 66 : 157) + rib;
        g = (door ? 76 : 163) + rib;
        b = (door ? 81 : 164) + rib;
        if (door && ((v * 12) % 1 < 0.035 || Math.abs(u - 0.5) < 0.006)) {
          r = 28;
          g = 35;
          b = 39;
        }
        if (
          ((Math.abs(u - 0.12) < 0.012 || Math.abs(u - 0.88) < 0.012) && v > 0.075 && v < 0.85) ||
          (Math.abs(v - 0.09) < 0.012 && u > 0.11 && u < 0.89)
        ) {
          r = 191;
          g = 195;
          b = 191;
        }
        if (v > 0.76 && v < 0.8 && (Math.abs(u - 0.48) < 0.009 || Math.abs(u - 0.52) < 0.009)) {
          r = 187;
          g = 171;
          b = 106;
        }
      } else if (kind === 'aircraft') {
        const panel = x % 64 < 1 || y % 128 < 1;
        r = panel ? 98 : 162;
        g = panel ? 106 : 170;
        b = panel ? 114 : 177;
      } else {
        r = 159;
        g = 161;
        b = 155;
      }
      const i = (y * size + x) * 4;
      const noise = grain * (kind === 'concrete' ? 18 : 7);
      data[i] = Math.max(0, Math.min(255, r + noise));
      data[i + 1] = Math.max(0, Math.min(255, g + noise));
      data[i + 2] = Math.max(0, Math.min(255, b + noise));
      data[i + 3] = 255;
    }
  return data;
}
