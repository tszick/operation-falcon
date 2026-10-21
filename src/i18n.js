import i18next from '../assets/vendor/i18next/i18next.js';
import messages from './locales/messages.json' with { type: 'json' };
import { readPreference, writePreference } from './ui/preferences.js';
export const LANGUAGE_KEY = 'falcon-language';
export const supportedLanguages = ['hu', 'en'];
export function detectLanguage(saved, browserLanguages = []) {
  if (supportedLanguages.includes(saved)) return saved;
  for (const language of browserLanguages) {
    const base = String(language).toLowerCase().split(/[-_]/)[0];
    if (supportedLanguages.includes(base)) return base;
  }
  return 'en';
}
const browser = typeof document !== 'undefined';
const initial = browser
  ? detectLanguage(readPreference(LANGUAGE_KEY), navigator.languages || [navigator.language])
  : 'hu';
const resources = Object.fromEntries(
  supportedLanguages.map((lang) => [
    lang,
    {
      translation: Object.fromEntries(
        Object.entries(messages).map(([source, entry]) => [source, entry[lang]]),
      ),
    },
  ]),
);
export const i18n = i18next.createInstance();
i18n.init({
  lng: initial,
  fallbackLng: 'en',
  supportedLngs: supportedLanguages,
  resources,
  initAsync: false,
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  showSupportNotice: false,
});
const sources = new Map(),
  reverse = new Map(),
  patterns = [],
  cache = new Map(),
  markupCache = new Map();
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [source, entry] of Object.entries(messages)) {
  for (const upper of [false, true]) {
    const normalized = source.replace(/\s+/g, ' ').trim();
    const key = upper ? normalized.toLocaleUpperCase('hu') : normalized;
    sources.set(key, { source, upper });
    for (const lang of supportedLanguages)
      reverse.set(upper ? entry[lang].toLocaleUpperCase(lang) : entry[lang], { source, upper });
    for (const template of new Set([source, entry.hu, entry.en])) {
      const normalized = template.replace(/\s+/g, ' ').trim();
      const text = upper ? normalized.toLocaleUpperCase('hu') : normalized;
      if (!text.includes('{{')) continue;
      const names = [...text.matchAll(/\{\{(v\d+)\}\}/gi)].map((m) => m[1].toLowerCase());
      const re = new RegExp(
        '^' +
          text
            .split(/\{\{v\d+\}\}/gi)
            .map(escapePattern)
            .join('([\\s\\S]+?)') +
          '$',
      );
      patterns.push({
        re,
        names,
        source,
        upper,
        prefix: text.split('{{')[0],
        weight: text.replace(/\{\{.*?\}\}/g, '').length,
      });
    }
  }
}
patterns.sort((a, b) => b.weight - a.weight);
const fragments = [...new Set([...sources.keys(), ...reverse.keys()])]
  .filter(
    (s) =>
      (s.length >= 4 || (s.length === 3 && s === s.toLocaleUpperCase('hu'))) && !s.includes('{{'),
  )
  .sort((a, b) => b.length - a.length);
const fragmentPattern = fragments.length
  ? new RegExp(fragments.map(escapePattern).join('|'), 'gu')
  : null;
function lookup(key, values) {
  const hit = sources.get(key) || reverse.get(key);
  if (!hit) return null;
  const value = i18n.t(hit.source, values);
  return hit.upper ? value.toLocaleUpperCase(i18n.language) : value;
}
export function tr(value) {
  if (value === null || value === undefined) return '';
  const input = String(value);
  if (!input.trim() || /^https?:\/\//i.test(input) || !/[a-záéíóöőúüű]/i.test(input)) return input;
  if (cache.has(input)) return cache.get(input);
  const raw = input.trim(),
    text = raw.replace(/\s+/g, ' ');
  let result = lookup(text);
  if (result === null) {
    for (const pattern of patterns) {
      if (pattern.prefix && !text.startsWith(pattern.prefix)) continue;
      const match = text.match(pattern.re);
      if (!match) continue;
      const values = Object.fromEntries(pattern.names.map((name, i) => [name, tr(match[i + 1])]));
      result = i18n.t(pattern.source, values);
      if (pattern.upper) result = result.toLocaleUpperCase(i18n.language);
      break;
    }
  }
  if (result === null)
    result = fragmentPattern
      ? text.replace(fragmentPattern, (part, offset) => {
          const before = text[offset - 1],
            after = text[offset + part.length];
          if ((before && /[\p{L}\p{N}]/u.test(before)) || (after && /[\p{L}\p{N}]/u.test(after)))
            return part;
          return lookup(part) ?? part;
        })
      : text;
  result =
    input.slice(0, input.indexOf(raw)) + result + input.slice(input.indexOf(raw) + raw.length);
  if (cache.size >= 1024) cache.delete(cache.keys().next().value);
  cache.set(input, result);
  return result;
}
const originals = new WeakMap();
function translateNode(node, attribute) {
  const value = attribute ? node.getAttribute(attribute) : node.nodeValue;
  if (!value || !value.trim()) return;
  let saved = originals.get(node);
  if (!saved) {
    saved = new Map();
    originals.set(node, saved);
  }
  const slot = attribute || 'text',
    prior = saved.get(slot);
  const source = prior?.rendered === value ? prior.source : value;
  const rendered = tr(source);
  saved.set(slot, { source, rendered });
  if (rendered !== value) {
    if (attribute) node.setAttribute(attribute, rendered);
    else node.nodeValue = rendered;
  }
}
export function localizeTree(root) {
  if (!browser || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (!element || !element.closest('script,style,code,pre,[data-no-i18n]')) {
      if (node.nodeType === 3) translateNode(node);
      else if (node.nodeType === 1)
        for (const attribute of ['title', 'aria-label', 'placeholder', 'alt'])
          if (node.hasAttribute(attribute)) translateNode(node, attribute);
    }
    node = walker.nextNode();
  }
}
export function trHtml(value) {
  if (!browser || !value) return value;
  const key = String(value);
  if (markupCache.has(key)) return markupCache.get(key);
  const template = document.createElement('template');
  template.innerHTML = key;
  localizeTree(template.content);
  const output = template.innerHTML;
  if (markupCache.size >= 256) markupCache.delete(markupCache.keys().next().value);
  markupCache.set(key, output);
  return output;
}
export function formatNumber(value, options = {}) {
  return Number(value).toLocaleString(i18n.language === 'hu' ? 'hu-HU' : 'en-US', options);
}
export function setLanguage(language, { persist = true } = {}) {
  if (!supportedLanguages.includes(language)) return false;
  i18n.changeLanguage(language);
  if (persist) writePreference(LANGUAGE_KEY, language);
  cache.clear();
  markupCache.clear();
  if (browser) {
    document.documentElement.lang = language;
    localizeTree(document);
    for (const select of document.querySelectorAll('[data-language-select]'))
      select.value = language;
    window.dispatchEvent(new CustomEvent('falcon:languagechange', { detail: { language } }));
  }
  return true;
}
function mountLanguage() {
  for (const header of document.querySelectorAll('header,[data-language-host]')) {
    if (header.querySelector('[data-language-select]')) continue;
    const host = header.querySelector('.header-right') || header;
    const label = document.createElement('label');
    label.className = 'language-control';
    label.innerHTML =
      '<span aria-hidden="true">◎</span><select data-language-select data-no-i18n aria-label="Nyelv / Language"><option value="hu">Magyar</option><option value="en">English</option></select>';
    host.append(label);
    label.querySelector('select').addEventListener('change', (e) => setLanguage(e.target.value));
  }
  setLanguage(i18n.language, { persist: false });
}
if (browser) {
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', mountLanguage, { once: true });
  else queueMicrotask(mountLanguage);
  window.addEventListener('storage', (event) => {
    if (event.key === LANGUAGE_KEY)
      setLanguage(detectLanguage(event.newValue, navigator.languages), { persist: false });
  });
}
