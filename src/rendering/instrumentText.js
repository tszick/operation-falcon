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
