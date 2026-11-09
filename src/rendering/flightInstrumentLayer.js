import { updateCockpitView } from '../cockpit.js';
// Native SVG/HTML instruments are composited by the browser. No DOM readback,
// glyph atlas, duplicate panel texture, or per-label GPU geometry is needed.
export class FlightInstrumentLayer {
  constructor(renderer) {
    this.renderer = renderer;
    this.root = document.getElementById('cockpit');
    this.active = false;
    this.metrics = { costs: [], painted: 0, pending: 0, ms: 0 };
  }
  async prepareAssets() {
    await document.fonts?.ready;
  }
  render() {
    this.root ||= document.getElementById('cockpit');
    updateCockpitView(this.root, this.renderer.w, this.renderer.h, this.renderer.headLook);
  }
}
