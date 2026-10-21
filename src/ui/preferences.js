// Storage may be disabled or full; preferences never block a flight.
export function readPreference(key, fallback = null, storage) {
  try {
    return (storage ?? globalThis.localStorage)?.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
export function writePreference(key, value, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    target.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}
