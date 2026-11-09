// SVG instrument geometry has no external textures. Keep its tessellated
// commands while only neighbouring text changes, without owning GPU buffers.
export class RetainedSvg {
  records = new WeakMap();
  clear() {
    this.records = new WeakMap();
  }
  invalidate(svg) {
    this.records.delete(svg);
  }
  invalidateTree(target) {
    this.invalidate(target);
    for (const svg of target.querySelectorAll?.('svg') || []) this.invalidate(svg);
  }
  paint(context, svg, key, draw) {
    let record = this.records.get(svg);
    if (!record || record.key !== key) {
      record = { ...context.capture(draw), key };
      this.records.set(svg, record);
    }
    context.replay(record);
  }
}
