import { materialPixels } from '../shared/materialPixels.js';
export class SurfaceTextures {
  constructor(gl) {
    this.gl = gl;
    this.cache = new Map();
    this.anisotropy = gl.getExtension?.('EXT_texture_filter_anisotropic');
  }
  bind(kind, unit = 0) {
    const g = this.gl;
    g.activeTexture(g.TEXTURE0 + unit);
    let texture = this.cache.get(kind);
    if (!texture) {
      texture = g.createTexture();
      g.bindTexture(g.TEXTURE_2D, texture);
      const size = kind === 'hangar' ? 512 : 256;
      g.texImage2D(
        g.TEXTURE_2D,
        0,
        g.RGBA,
        size,
        size,
        0,
        g.RGBA,
        g.UNSIGNED_BYTE,
        materialPixels(kind, size),
      );
      g.generateMipmap(g.TEXTURE_2D);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.REPEAT);
      if (this.anisotropy)
        g.texParameterf(
          g.TEXTURE_2D,
          this.anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
          Math.min(4, g.getParameter(this.anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)),
        );
      this.cache.set(kind, texture);
    }
    g.activeTexture(g.TEXTURE0 + unit);
    g.bindTexture(g.TEXTURE_2D, texture);
  }
}
