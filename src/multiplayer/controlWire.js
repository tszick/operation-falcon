import { INPUT_BATCH_LIMIT, toggleKeys, weaponChoices, validCommand } from './protocol.js';

// Run-length encoding preserves every 120 Hz command, including one-shot toggles.
export function packControlBatch(commands) {
  const out = [commands[0].seq];
  let last, signature;
  for (const c of commands) {
    const a = c.axes,
      b = c.combat;
    const row = [
      1,
      a.pitch,
      a.roll,
      a.yaw,
      a.throttle,
      (a.brake ? 1 : 0) | (b?.fire ? 2 : 0) | (b?.cycle ? 4 : 0) | (b?.countermeasures ? 8 : 0),
      c.toggles.map((key) => toggleKeys.indexOf(key)),
      b ? weaponChoices.indexOf(b.weapon) : -1,
    ];
    const key = JSON.stringify(row.slice(1));
    if (last && key === signature) last[0]++;
    else {
      out.push(row);
      last = row;
      signature = key;
    }
  }
  return out;
}
export function unpackControlBatch(packed) {
  if (
    !Array.isArray(packed) ||
    packed.length < 2 ||
    packed.length > INPUT_BATCH_LIMIT + 1 ||
    !Number.isSafeInteger(packed[0]) ||
    packed[0] < 1
  )
    throw new Error('Invalid control batch');
  const out = [];
  let seq = packed[0];
  for (const row of packed.slice(1)) {
    if (!Array.isArray(row) || row.length !== 8) throw new Error('Invalid control run');
    const [count, pitch, roll, yaw, throttle, flags, toggles, weapon] = row;
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      out.length + count > INPUT_BATCH_LIMIT ||
      !Number.isInteger(flags) ||
      flags < 0 ||
      flags > 15 ||
      !Number.isInteger(weapon) ||
      weapon < -1 ||
      weapon >= weaponChoices.length ||
      (weapon === -1 && flags & 14) ||
      !Array.isArray(toggles) ||
      toggles.length > toggleKeys.length ||
      toggles.some((i) => !Number.isInteger(i) || i < 0 || i >= toggleKeys.length)
    )
      throw new Error('Invalid control run');
    const command = {
      seq,
      axes: { pitch, roll, yaw, throttle, brake: !!(flags & 1) },
      toggles: toggles.map((i) => toggleKeys[i]),
      ...(weapon >= 0
        ? {
            combat: {
              weapon: weaponChoices[weapon],
              fire: !!(flags & 2),
              cycle: !!(flags & 4),
              countermeasures: !!(flags & 8),
            },
          }
        : {}),
    };
    if (!validCommand(command)) throw new Error('Invalid control values');
    for (let i = 0; i < count; i++) {
      if (!Number.isSafeInteger(seq)) throw new Error('Invalid control sequence');
      out.push({ ...command, seq: seq++ });
    }
  }
  return out;
}
