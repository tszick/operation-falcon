import { hudGlassScreenPoints } from '../hudGlassGeometry.js';
// The browser composites this retained transparent display in the physical
// combiner plane. Both WebGPU and WebGL use the same projective transform;
// no pixel readback or per-frame DOM measurements are needed.
export class HudGlassLayer {
  constructor(worldCanvas) {
    this.document = worldCanvas.ownerDocument;
  }
  hide() {
    if (this.canvas) this.canvas.hidden = true;
  }
  render(width, height, matrix, draw, opacity = 1) {
    const doc = this.document,
      root = doc?.getElementById('flight-ui');
    if (!root) return false;
    if (!this.canvas?.isConnected) {
      this.canvas = doc.getElementById('hud-glass-display') || doc.createElement('canvas');
      this.canvas.id = 'hud-glass-display';
      this.canvas.dataset.native2d = 'true';
      this.canvas.setAttribute('aria-hidden', 'true');
      root.prepend(this.canvas);
      this.context = this.canvas.getContext('2d');
      this.size = '';
    }
    const dpr = Math.min(doc.defaultView?.devicePixelRatio || 1, 2),
      size = `${width}:${height}:${dpr}`,
      canvas = this.canvas,
      c = this.context;
    if (size !== this.size) {
      this.size = size;
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.style.clipPath = `polygon(${hudGlassScreenPoints(width, height)
        .map(([x, y]) => `${x}px ${y}px`)
        .join(',')})`;
    }
    canvas.hidden = false;
    canvas.style.opacity = String(opacity);
    const transform = `matrix3d(${matrix.join(',')})`;
    if (canvas.style.transform !== transform) canvas.style.transform = transform;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.save();
    try {
      draw(c);
    } finally {
      c.restore();
    }
    return true;
  }
}
