// Keep glyphs at their intended size: Canvas maxWidth would squeeze the whole label.
export function ellipsizeText(text, width, measure) {
  if (measure(text) <= width) return text;
  const suffix = '…';
  if (measure(suffix) > width) return '';
  const chars = [...text];
  let low = 0,
    high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(chars.slice(0, mid).join('') + suffix) <= width) low = mid;
    else high = mid - 1;
  }
  return chars.slice(0, low).join('') + suffix;
}

// Physical cockpit controls have an explicit pixel width and no border. Reuse
// that layout result instead of forcing a fresh DOM layout after HUD writes.
export function controlTextWidth(element) {
  const declared = element.style.width;
  if (typeof declared === 'string' && declared.endsWith('px')) {
    const width = Number.parseFloat(declared);
    if (Number.isFinite(width) && width > 0) return Math.round(width);
  }
  return element.clientWidth;
}
