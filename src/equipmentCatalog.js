import entries from './equipmentCatalogData.json' with { type: 'json' };
// Public identity is independent of simulation IDs, performance profiles and saved logs.
export const equipmentCatalogVersion = 1;
export const equipmentCatalog = Object.freeze(
  entries.map((e) =>
    Object.freeze({
      ...e,
      legacyAliases: Object.freeze(e.legacyAliases),
      legacyForms: Object.freeze((e.legacyForms || []).map(Object.freeze)),
    }),
  ),
);
const byId = new Map(equipmentCatalog.map((e) => [`${e.kind}:${e.id}`, e]));
const linkedUnits = { tanker: 'kc135', civil: 'airliner' };
export function catalogEntry(kind, id) {
  if (kind === 'unit' && linkedUnits[id]) return byId.get(`aircraft:${linkedUnits[id]}`);
  return byId.get(`${kind}:${String(id).replace(/^weapon-/, '')}`);
}
export const catalogLabel = (kind, id, { compact = false } = {}) => {
  const e = catalogEntry(kind, id);
  return e ? (compact ? e.code : `${e.code} (${e.nickname})`) : '';
};
export function equipmentLabel(target, options = {}) {
  const kind = target.aircraftId || target.spec ? 'aircraft' : 'unit';
  return (
    catalogLabel(kind, target.aircraftId || target.spec?.id || target.type, options) ||
    renameEquipmentText(target.name || target.type || '', options)
  );
}
const normalize = (text) =>
  text
    .replace(/[–—‑−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
const aliases = new Map(),
  suffixes = new Map();
for (const entry of equipmentCatalog)
  for (const alias of entry.legacyAliases) {
    const key = normalize(alias);
    if (aliases.has(key) && aliases.get(key) !== entry)
      throw new Error(`Duplicate catalogue alias: ${alias}`);
    aliases.set(key, entry);
  }
for (const entry of equipmentCatalog)
  for (const form of entry.legacyForms) {
    const key = normalize(form.text);
    if (aliases.has(key)) throw new Error(`Duplicate catalogue form: ${form.text}`);
    aliases.set(key, entry);
    suffixes.set(key, form.suffix);
  }
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:` +
    [...aliases.keys()]
      .sort((a, b) => b.length - a.length)
      .map((s) =>
        escape(s)
          .replace(/-/g, '[-–—‑−]')
          .replace(/ /g, String.raw`\s+`),
      )
      .join('|') +
    String.raw`)(?![\p{L}\p{N}])`,
  'giu',
);
export function renameEquipmentText(value, { compact = false } = {}) {
  return String(value).replace(pattern, (alias) => {
    const entry = aliases.get(normalize(alias));
    const label = compact ? entry.code : `${entry.code} (${entry.nickname})`;
    return label + (suffixes.get(normalize(alias)) || '');
  });
}
