export const PROTOCOL_VERSION = 8;
export const MULTIPLAYER_PATH = '/multiplayer';
export const roomScenarios = ['range', 'combat', 'cooperative', 'arena'];
export const ROOM_CAPACITY = 5;
export const SNAPSHOT_BYTES_LIMIT = 256 * 1024;
export const NETWORK_STEP = 1 / 120;
export const SNAPSHOT_INTERVAL = 6;
export const INPUT_BATCH_LIMIT = 12;
export const INPUT_QUEUE_LIMIT = 48;
export const weaponChoices = ['gun', 'aam', 'agm', 'bomb'];
export const PROJECTILE_LIMIT = 192;
export const EVENT_LIMIT = 128;
export const aircraftChoices = ['f16', 'fa18'];
export const toggleKeys = [
  'gear',
  'flaps',
  'airbrake',
  'afterburner',
  'assist',
  'landing',
  'landingGuide',
];
export function validRoomCode(code) {
  return typeof code === 'string' && /^[A-HJ-NP-Z2-9]{6}$/.test(code);
}
export function validCombatCommand(combat) {
  return (
    !!combat &&
    weaponChoices.includes(combat.weapon) &&
    ['fire', 'cycle', 'countermeasures'].every((key) => typeof combat[key] === 'boolean') &&
    Object.keys(combat).every((key) => ['weapon', 'fire', 'cycle', 'countermeasures'].includes(key))
  );
}
export function validCommand(command) {
  if (!command || !Number.isSafeInteger(command.seq) || command.seq < 1) return false;
  const a = command.axes;
  if (
    !a ||
    !['pitch', 'roll', 'yaw', 'throttle'].every(
      (key) => Number.isFinite(a[key]) && Math.abs(a[key]) <= 1,
    ) ||
    typeof a.brake !== 'boolean'
  )
    return false;
  return (
    (command.combat === undefined || validCombatCommand(command.combat)) &&
    Array.isArray(command.toggles) &&
    command.toggles.length <= toggleKeys.length &&
    new Set(command.toggles).size === command.toggles.length &&
    command.toggles.every((key) => toggleKeys.includes(key)) &&
    Object.keys(command).every((key) => ['seq', 'axes', 'toggles', 'combat'].includes(key)) &&
    Object.keys(a).every((key) => ['pitch', 'roll', 'yaw', 'throttle', 'brake'].includes(key))
  );
}
export function neutralAxes() {
  return { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: false };
}
