// Keep large data-texture transfers out of a single rendering task.
export class TextureUpload {
  constructor(texture, pixels, width, height, rowsPerStep = 128) {
    Object.assign(this, { texture, pixels, width, height, rowsPerStep });
    this.row = 0;
  }
  step(queue) {
    if (this.row >= this.height) return true;
    const rows = Math.min(this.rowsPerStep, this.height - this.row);
    queue.writeTexture(
      { texture: this.texture, origin: [0, this.row, 0] },
      this.pixels,
      { offset: this.row * this.width * 4, bytesPerRow: this.width * 4 },
      [this.width, rows, 1],
    );
    this.row += rows;
    return this.row === this.height;
  }
}
