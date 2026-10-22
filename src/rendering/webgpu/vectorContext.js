import { Surface } from './device.js';
import { rgba, transformPoint, multiply, triangulate } from '../shared/shapes.js';
const surfaces = new WeakMap();
export const shader = `
diagnostic(off, derivative_uniformity);
struct Out { @builtin(position) position:vec4f, @location(0) color:vec4f, @location(1) uv:vec2f, @location(2) @interpolate(flat) mode:u32, @location(3) @interpolate(flat) stroke:f32 };
@group(0) @binding(0) var image:texture_2d<f32>;
@group(0) @binding(1) var imageSampler:sampler;
@vertex fn vs(@location(0) position:vec2f,@location(1) color:vec4f,@location(2) uv:vec2f,@location(3) mode:f32)->Out {
 var o:Out;o.position=vec4f(position,0,1);o.color=color;o.uv=uv;o.mode=u32(mode);o.stroke=fract(mode)*100.0;return o;
}
@fragment fn fs(o:Out)->@location(0) vec4f {
 var c=o.color;
 if(o.mode==6u){let tex=textureSample(image,imageSampler,o.uv);return vec4f(tex.rgb*c.rgb*c.a,tex.a*c.a);}
 if(o.mode==5u){let texel=vec2f(1.0)/vec2f(textureDimensions(image));let a=max(textureSample(image,imageSampler,o.uv).a,max(textureSample(image,imageSampler,o.uv+vec2f(texel.x*0.7,0)).a,textureSample(image,imageSampler,o.uv-vec2f(texel.x*0.7,0)).a));c.a*=a;}
 if(o.mode==1u){c*=textureSample(image,imageSampler,o.uv);}
 if(o.mode==2u){c*=textureSample(image,imageSampler,vec2f(clamp(o.uv.x,0,1),0.5));}
 if(o.mode==3u){c*=textureSample(image,imageSampler,vec2f(clamp(length(o.uv),0,1),0.5));}
 if(o.mode==4u){let s=vec2f(1.0)/vec2f(textureDimensions(image));var a=0.0;
 for(var x=-2;x<=2;x++){for(var y=-2;y<=2;y++){a=max(a,textureSample(image,imageSampler,o.uv+vec2f(f32(x),f32(y))*s*o.stroke*0.5).a);}}
 c.a*=a;}
 return vec4f(c.rgb*c.a,c.a);
}`;
class Gradient {
  constructor(kind, values, matrix) {
    this.kind = kind;
    this.values = values;
    this.matrix = matrix;
    this.stops = [];
  }
  addColorStop(offset, color) {
    this.stops.push([offset, rgba(color)]);
    this.stops.sort((a, b) => a[0] - b[0]);
  }
}
function fontSize(font) {
  return Number(font.match(/([\d.]+)px/)?.[1] || 12);
}
export class VectorContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.surface = new Surface(canvas);
    this.surface.painter = this;
    surfaces.set(canvas, this);
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.globalAlpha = 1;
    this.font = '12px Consolas,monospace';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.lineJoin = 'miter';
    this.matrix = [1, 0, 0, 1, 0, 0];
    this.stack = [];
    this.paths = [];
    this.dash = [];
    this.vertices = [];
    this.batches = [];
    this.images = new WeakMap();
    this.bindings = new WeakMap();
    this.pendingText = [];
    this.gradients = new Map();
    this.clipRect = null;
    this.coordinateScale = 1;
    this.surface.onready = () => {
      this.initialize();
      this.surface.schedule();
    };
  }
  initialize() {
    const d = this.surface.device,
      module = d.createShaderModule({ code: shader });
    this.pipeline = d.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: 36,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x4' },
              { shaderLocation: 2, offset: 24, format: 'float32x2' },
              { shaderLocation: 3, offset: 32, format: 'float32' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format: this.surface.runtime.format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          },
        ],
      },
      multisample: { count: 4 },
      primitive: { topology: 'triangle-list' },
    });
    this.sampler = d.createSampler({ minFilter: 'linear', magFilter: 'linear' });
    this.white = this.texture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.atlas = null;
    this.atlasReady = this.loadAtlas();
  }
  texture(data, width, height) {
    const d = this.surface.device,
      t = d.createTexture({
        size: [width, height],
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
    d.queue.writeTexture({ texture: t }, data, { bytesPerRow: width * 4 }, [width, height]);
    return t;
  }
  binding(texture) {
    if (this.bindings.has(texture)) return this.bindings.get(texture);
    const binding = this.surface.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: this.sampler },
      ],
    });
    this.bindings.set(texture, binding);
    return binding;
  }
  async loadAtlas() {
    // The browser decodes a static glyph atlas; no Canvas2D context is allocated.
    const chars = Array.from({ length: 512 }, (_, i) => String.fromCodePoint(i + 32)).concat([
      ...'→←↑↓↗⊡●○—−°×✓ⓘ≈≤≥±∞△▽✕',
    ]);
    this.glyphs = new Map(chars.map((c, i) => [c, i]));
    const escape = (s) =>
      s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const text = chars
      .map(
        (c, i) =>
          `<text x="${(i % 32) * 40 + 4}" y="${Math.floor(i / 32) * 48 + 36}">${escape(c)}</text>`,
      )
      .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="${Math.ceil(chars.length / 32) * 48}"><g font-family="Consolas,monospace" font-size="32" fill="white">${text}</g></svg>`;
    const image = new Image();
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await image.decode();
    this.atlas = this.externalTexture(image);
    this.atlasWidth = image.naturalWidth;
    this.atlasHeight = image.naturalHeight;
    const pending = this.pendingText;
    this.pendingText = [];
    for (const item of pending) {
      this.save();
      Object.assign(this, item.state);
      this.text(...item.args);
      this.restore();
    }
  }
  externalTexture(image) {
    const known = this.images.get(image);
    if (known) return known;
    const width = image.naturalWidth || image.width,
      height = image.naturalHeight || image.height;
    if (!width || !height) return null;
    const d = this.surface.device,
      t = d.createTexture({
        size: [width, height],
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
    d.queue.copyExternalImageToTexture({ source: image }, { texture: t }, [width, height]);
    this.images.set(image, t);
    return t;
  }
  save() {
    this.stack.push({
      projective: this.projective,
      coordinateScale: this.coordinateScale,
      matrix: [...this.matrix],
      clipRect: this.clipRect && [...this.clipRect],
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      globalAlpha: this.globalAlpha,
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      dash: [...this.dash],
    });
  }
  restore() {
    const s = this.stack.pop();
    if (s) Object.assign(this, s);
  }
  setTransform(a, b, c, d, e, f) {
    this.matrix = [a, b, c, d, e, f];
  }
  resetTransform() {
    this.matrix = [1, 0, 0, 1, 0, 0];
    this.projective = null;
  }
  setProjectiveTransform(matrix) {
    this.matrix = [1, 0, 0, 1, 0, 0];
    this.projective =
      typeof matrix.transformPoint === 'function'
        ? matrix
        : new DOMMatrix([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]);
  }
  transform(a, b, c, d, e, f) {
    this.matrix = multiply(this.matrix, [a, b, c, d, e, f]);
  }
  translate(x, y) {
    this.transform(1, 0, 0, 1, x, y);
  }
  scale(x, y) {
    this.transform(x, 0, 0, y, 0, 0);
  }
  rotate(a) {
    this.transform(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0);
  }
  setLineDash(values) {
    this.dash = [...values];
  }
  getLineDash() {
    return [...this.dash];
  }
  beginPath() {
    this.paths = [];
    this.path = null;
  }
  moveTo(x, y) {
    this.path = [transformPoint(this.matrix, x, y)];
    this.paths.push(this.path);
  }
  lineTo(x, y) {
    if (!this.path) this.moveTo(x, y);
    else this.path.push(transformPoint(this.matrix, x, y));
  }
  closePath() {
    if (this.path?.length) this.path.push([...this.path[0]]);
  }
  rect(x, y, w, h) {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }
  ellipse(x, y, rx, ry, rotation, start, end, ccw = false) {
    let delta = end - start;
    if (!ccw && delta < 0) delta = (delta % (Math.PI * 2)) + Math.PI * 2;
    if (ccw && delta > 0) delta = (delta % (Math.PI * 2)) - Math.PI * 2;
    if (Math.abs(end - start) >= Math.PI * 2) delta = (ccw ? -1 : 1) * Math.PI * 2;
    const count = Math.max(4, Math.ceil(Math.abs(delta) * Math.sqrt(Math.max(rx, ry)) * 1.5));
    for (let i = 0; i <= count; i++) {
      const a = start + (delta * i) / count,
        px = x + Math.cos(a) * rx * Math.cos(rotation) - Math.sin(a) * ry * Math.sin(rotation),
        py = y + Math.cos(a) * rx * Math.sin(rotation) + Math.sin(a) * ry * Math.cos(rotation);
      if (i === 0 && !this.path) this.moveTo(px, py);
      else this.lineTo(px, py);
    }
  }
  arc(x, y, r, start, end, ccw = false) {
    this.ellipse(x, y, r, r, 0, start, end, ccw);
  }
  clip() {
    const points = this.paths.flat();
    if (!points.length) return;
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]),
      next = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(
        (value) => value * this.coordinateScale,
      );
    this.clipRect = this.clipRect
      ? [
          Math.max(this.clipRect[0], next[0]),
          Math.max(this.clipRect[1], next[1]),
          Math.min(this.clipRect[2], next[2]),
          Math.min(this.clipRect[3], next[3]),
        ]
      : next;
  }
  createLinearGradient(...values) {
    return new Gradient('linear', values, [...this.matrix]);
  }
  createRadialGradient(...values) {
    return new Gradient('radial', values, [...this.matrix]);
  }
  paint(style) {
    if (!(style instanceof Gradient))
      return { color: rgba(style), mode: 0, texture: null, uv: () => [0, 0] };
    const key = JSON.stringify(style.stops);
    let texture = this.gradients.get(key);
    if (!texture && this.surface.device) {
      const data = new Uint8Array(256 * 4);
      for (let i = 0; i < 256; i++) {
        const t = i / 255,
          stops = style.stops;
        let a = stops[0] || [0, [0, 0, 0, 0]],
          b = stops.at(-1) || a;
        for (let j = 1; j < stops.length; j++)
          if (stops[j][0] >= t) {
            a = stops[j - 1];
            b = stops[j];
            break;
          }
        const f = Math.max(0, Math.min(1, (t - a[0]) / Math.max(1e-6, b[0] - a[0])));
        for (let j = 0; j < 4; j++)
          data[i * 4 + j] = Math.round((a[1][j] * (1 - f) + b[1][j] * f) * 255);
      }
      texture = this.texture(data, 256, 1);
      this.gradients.set(key, texture);
    }
    if (style.kind === 'linear') {
      const [x0, y0, x1, y1] = style.values,
        a = transformPoint(style.matrix, x0, y0),
        b = transformPoint(style.matrix, x1, y1),
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        den = Math.max(1e-9, dx * dx + dy * dy);
      return {
        color: [1, 1, 1, 1],
        mode: 2,
        texture,
        uv: (p) => [((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den, 0],
      };
    }
    const [, , , x, y, r] = style.values,
      center = transformPoint(style.matrix, x, y),
      radius = r * Math.hypot(style.matrix[0], style.matrix[1]);
    return {
      color: [1, 1, 1, 1],
      mode: 3,
      texture,
      uv: (p) => [(p[0] - center[0]) / radius, (p[1] - center[1]) / radius],
    };
  }
  triangles(points, style, options = {}) {
    if (!points.length) return;
    const paint = this.paint(style),
      color = [...paint.color];
    color[3] *= this.globalAlpha;
    if (color[3] <= 0) return;
    const first = this.vertices.length / 9;
    for (let i = 0; i < points.length; i++) {
      let p = points[i];
      const uv = options.uv?.[i] || paint.uv(p);
      if (this.projective) {
        const v = this.projective.transformPoint(new DOMPoint(p[0], p[1]));
        p = [v.x / v.w, v.y / v.w];
      }
      this.vertices.push(
        ((p[0] * this.coordinateScale) / this.canvas.width) * 2 - 1,
        1 - ((p[1] * this.coordinateScale) / this.canvas.height) * 2,
        ...color,
        ...uv,
        options.mode ?? paint.mode,
      );
    }
    const texture = options.texture || paint.texture || (style instanceof Gradient ? style : null),
      clip = this.clipRect && [...this.clipRect],
      last = this.batches.at(-1),
      key = JSON.stringify(clip);
    if (
      last &&
      last.texture === texture &&
      last.clipKey === key &&
      last.first + last.count === first
    )
      last.count += points.length;
    else this.batches.push({ first, count: points.length, texture, clip, clipKey: key });
    this.surface.schedule();
  }
  fill() {
    for (const path of this.paths) this.triangles(triangulate(path), this.fillStyle);
  }
  stroke() {
    const scale = Math.hypot(this.matrix[0], this.matrix[1]),
      half = (this.lineWidth * scale) / 2,
      triangles = [];
    for (const path of this.paths) {
      let walked = 0;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1],
          b = path[i],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          len = Math.hypot(dx, dy);
        if (len < 1e-8) continue;
        const nx = (-dy / len) * half,
          ny = (dx / len) * half;
        const segment = (lo, hi) => {
          const p = [a[0] + dx * lo, a[1] + dy * lo],
            q = [a[0] + dx * hi, a[1] + dy * hi],
            v = [
              [p[0] + nx, p[1] + ny],
              [q[0] + nx, q[1] + ny],
              [q[0] - nx, q[1] - ny],
              [p[0] - nx, p[1] - ny],
            ];
          triangles.push(v[0], v[1], v[2], v[0], v[2], v[3]);
        };
        const dash = this.dash.length % 2 ? [...this.dash, ...this.dash] : this.dash,
          total = dash.reduce((s, x) => s + x * scale, 0);
        if (!total) segment(0, 1);
        else {
          let pos = 0;
          while (pos < len) {
            let phase = (walked + pos) % total,
              index = 0;
            while (index < dash.length - 1 && phase >= dash[index] * scale) {
              phase -= dash[index] * scale;
              index++;
            }
            const end = Math.min(len, pos + Math.max(0.01, dash[index] * scale - phase));
            if (index % 2 === 0) segment(pos / len, end / len);
            pos = end;
          }
        }
        walked += len;
      }
    }
    this.triangles(triangles, this.strokeStyle);
  }
  fillRect(x, y, w, h) {
    const p = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ].map((v) => transformPoint(this.matrix, ...v));
    this.triangles([p[0], p[1], p[2], p[0], p[2], p[3]], this.fillStyle);
  }
  strokeRect(x, y, w, h) {
    const old = this.paths,
      path = this.path;
    this.beginPath();
    this.rect(x, y, w, h);
    this.stroke();
    this.paths = old;
    this.path = path;
  }
  clearRect(x, y, w, h) {
    if (
      x === 0 &&
      y === 0 &&
      w * Math.abs(this.matrix[0]) >= this.canvas.width &&
      h * Math.abs(this.matrix[3]) >= this.canvas.height
    ) {
      this.vertices = [];
      this.batches = [];
      this.pendingText = [];
      this.surface.clear = true;
      this.surface.schedule();
      return;
    }
    // Partial clears are used only before opaque panel redraws; erase via a dedicated transparent pass.
    this.flush();
    if (!this.surface.resize()) return;
    const d = this.surface.device,
      encoder = d.createCommandEncoder(),
      pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.surface.target.createView(),
            loadOp: 'clear',
            clearValue: [0, 0, 0, 0],
            storeOp: 'store',
          },
        ],
      });
    pass.end();
    d.queue.submit([encoder.finish()]);
  }
  measureText(value) {
    const size = fontSize(this.font);
    return {
      width: [...String(value)].length * size * 0.55,
      actualBoundingBoxAscent: size * 0.8,
      actualBoundingBoxDescent: size * 0.2,
    };
  }
  fillText(value, x, y, maxWidth) {
    this.text(value, x, y, this.fillStyle, false, maxWidth);
  }
  strokeText(value, x, y, maxWidth) {
    this.text(value, x, y, this.strokeStyle, true, maxWidth);
  }
  text(value, x, y, style, outline, maxWidth) {
    if (!this.atlas) {
      this.pendingText.push({
        args: [value, x, y, style, outline, maxWidth],
        state: {
          font: this.font,
          textAlign: this.textAlign,
          textBaseline: this.textBaseline,
          matrix: [...this.matrix],
          projective: this.projective,
          globalAlpha: this.globalAlpha,
          clipRect: this.clipRect && [...this.clipRect],
        },
      });
      return;
    }
    value = String(value);
    const size = fontSize(this.font),
      width = this.measureText(value).width,
      ratio = maxWidth ? Math.min(1, maxWidth / width) : 1;
    if (this.textAlign === 'center') x -= (width * ratio) / 2;
    else if (['right', 'end'].includes(this.textAlign)) x -= width * ratio;
    if (this.textBaseline === 'top') y += size * 0.8;
    else if (this.textBaseline === 'middle') y += size * 0.3;
    const old = this.fillStyle;
    this.fillStyle = style;
    for (const char of value) {
      const id = this.glyphs.get(char) ?? this.glyphs.get('?'),
        u = (id % 32) * 40,
        v = Math.floor(id / 32) * 48;
      const left = x - ((4 * size) / 32) * ratio,
        top = y - (36 * size) / 32,
        w = ((40 * size) / 32) * ratio,
        h = (48 * size) / 32,
        p = [
          [left, top],
          [left + w, top],
          [left + w, top + h],
          [left, top + h],
        ].map((v) => transformPoint(this.matrix, ...v)),
        uv = [
          [u / this.atlasWidth, v / this.atlasHeight],
          [(u + 40) / this.atlasWidth, v / this.atlasHeight],
          [(u + 40) / this.atlasWidth, (v + 48) / this.atlasHeight],
          [u / this.atlasWidth, (v + 48) / this.atlasHeight],
        ];
      this.triangles([p[0], p[1], p[2], p[0], p[2], p[3]], style, {
        texture: this.atlas,
        mode: outline
          ? 4 + Math.min(0.99, (this.lineWidth * 16) / size / 100)
          : /bold|[6-9]00/.test(this.font)
            ? 5
            : 1,
        uv: [uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]],
      });
      x += size * 0.55 * ratio;
    }
    this.fillStyle = old;
  }
  drawImage(image, ...args) {
    if (!this.surface.device) return;
    const source = surfaces.get(image);
    if (source) {
      source.flush();
      if (!source.surface.target) return;
    }
    const texture = source ? source.surface.target : this.externalTexture(image);
    if (!texture) return;
    let sx = 0,
      sy = 0,
      sw = image.naturalWidth || image.width,
      sh = image.naturalHeight || image.height,
      x,
      y,
      w,
      h;
    if (args.length === 2) {
      [x, y] = args;
      w = sw;
      h = sh;
    } else if (args.length === 4) [x, y, w, h] = args;
    else [sx, sy, sw, sh, x, y, w, h] = args;
    const iw = image.naturalWidth || image.width,
      ih = image.naturalHeight || image.height,
      p = [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ].map((v) => transformPoint(this.matrix, ...v)),
      uv = [
        [sx / iw, sy / ih],
        [(sx + sw) / iw, sy / ih],
        [(sx + sw) / iw, (sy + sh) / ih],
        [sx / iw, (sy + sh) / ih],
      ];
    this.triangles([p[0], p[1], p[2], p[0], p[2], p[3]], '#ffffff', {
      texture,
      mode: source ? 6 : 1,
      uv: [uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]],
    });
  }
  // Retain tessellated panels without repeating DOM layout and glyph construction.
  capture(draw) {
    const vertices = this.vertices,
      batches = this.batches;
    this.vertices = [];
    this.batches = [];
    try {
      draw();
      return { vertices: this.vertices, batches: this.batches };
    } finally {
      this.vertices = vertices;
      this.batches = batches;
    }
  }
  replay(record, { x = 0, y = 0, alpha = 1 } = {}) {
    const offset = this.vertices.length / 9;
    const dx = (x / this.canvas.width) * 2,
      dy = (y / this.canvas.height) * 2;
    for (let i = 0; i < record.vertices.length; i += 9)
      this.vertices.push(
        record.vertices[i] + dx,
        record.vertices[i + 1] - dy,
        record.vertices[i + 2],
        record.vertices[i + 3],
        record.vertices[i + 4],
        record.vertices[i + 5] * alpha,
        record.vertices[i + 6],
        record.vertices[i + 7],
        record.vertices[i + 8],
      );
    for (const batch of record.batches)
      this.batches.push({ ...batch, first: batch.first + offset });
  }
  renderRecords(records) {
    if (!this.pipeline || !this.surface.resize()) return;
    const d = this.surface.device,
      encoder = d.createCommandEncoder(),
      pass = this.surface.pass(encoder);
    pass.setPipeline(this.pipeline);
    for (const record of records) {
      if (!record?.vertices.length) continue;
      if (!record.uploaded) {
        const values = new Float32Array(record.vertices);
        if (!record.buffer || record.buffer.size < values.byteLength) {
          record.buffer?.destroy();
          record.buffer = d.createBuffer({
            size: Math.max(4096, values.byteLength * 2),
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          });
        }
        d.queue.writeBuffer(record.buffer, 0, values);
        record.uploaded = true;
      }
      pass.setVertexBuffer(0, record.buffer);
      this.drawBatches(pass, record.batches);
    }
    pass.end();
    d.queue.submit([encoder.finish()]);
  }
  flush() {
    if (!this.pipeline || !this.surface.resize()) return;
    if (!this.vertices.length) {
      if (this.surface.clear) {
        const encoder = this.surface.device.createCommandEncoder(),
          pass = this.surface.pass(encoder);
        pass.end();
        this.surface.device.queue.submit([encoder.finish()]);
      }
      return;
    }
    const d = this.surface.device,
      values = new Float32Array(this.vertices);
    if (!this.buffer || this.buffer.size < values.byteLength) {
      this.buffer?.destroy();
      this.buffer = d.createBuffer({
        size: Math.max(65536, values.byteLength * 2),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    d.queue.writeBuffer(this.buffer, 0, values);
    const encoder = d.createCommandEncoder(),
      pass = this.surface.pass(encoder);
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.buffer);
    this.drawBatches(pass, this.batches);
    pass.end();
    d.queue.submit([encoder.finish()]);
    this.vertices = [];
    this.batches = [];
    while (this.gradients.size > 256) {
      const [key, texture] = this.gradients.entries().next().value;
      texture.destroy();
      this.gradients.delete(key);
    }
  }
  drawBatches(pass, batches) {
    for (const b of batches) {
      const clip = b.clip || [0, 0, this.canvas.width, this.canvas.height],
        x = Math.max(0, Math.floor(clip[0])),
        y = Math.max(0, Math.floor(clip[1])),
        w = Math.max(0, Math.min(this.canvas.width, Math.ceil(clip[2])) - x),
        h = Math.max(0, Math.min(this.canvas.height, Math.ceil(clip[3])) - y);
      if (!w || !h) continue;
      pass.setScissorRect(x, y, w, h);
      pass.setBindGroup(
        0,
        this.binding(
          (b.texture instanceof Gradient ? this.paint(b.texture).texture : b.texture) || this.white,
        ),
      );
      pass.draw(b.count, 1, b.first);
    }
  }
}
export function vectorContext(canvas) {
  let c = surfaces.get(canvas);
  if (!c) c = new VectorContext(canvas);
  return c;
}
