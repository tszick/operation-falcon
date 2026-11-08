import { RetainedSvg } from './retainedSvg.js';
import { drawingContext } from './createBackend.js';
import { ellipsizeText } from './instrumentText.js';
// DOM remains the semantic/input/layout model. Only WebGPU paints the flight instruments.
const imageCache = new Map();
let imageRevision = 0;
function imageFor(url) {
  let image = imageCache.get(url);
  if (!image) {
    image = new Image();
    image.onload = () => imageRevision++;
    image.src = url;
    imageCache.set(url, image);
  }
  return image.complete && image.naturalWidth ? image : null;
}
const number = (value) => Number.parseFloat(value) || 0;
function matrixFor(element, cache, knownStyle) {
  if (cache.has(element)) return cache.get(element);
  const parent = element.offsetParent,
    style = knownStyle || getComputedStyle(element),
    origin = style.transformOrigin.split(' ').map(number);
  let matrix = parent ? matrixFor(parent, cache) : new DOMMatrix();
  matrix = matrix.translate(
    element.offsetLeft + (parent?.clientLeft || 0) - (parent?.scrollLeft || 0),
    element.offsetTop + (parent?.clientTop || 0) - (parent?.scrollTop || 0),
  );
  if (style.transform !== 'none')
    matrix = matrix
      .translate(origin[0], origin[1])
      .multiply(new DOMMatrix(style.transform))
      .translate(-origin[0], -origin[1]);
  cache.set(element, matrix);
  return matrix;
}
function map(matrix, x, y) {
  const p = matrix.transformPoint(new DOMPoint(x, y));
  return [p.x / p.w, p.y / p.w];
}
function quad(context, matrix, x, y, w, h, color) {
  const p = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ].map((p) => map(matrix, ...p));
  context.triangles([p[0], p[1], p[2], p[0], p[2], p[3]], color);
}
function pathData(context, data) {
  const tokens = data.match(/[a-zA-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g) || [];
  let i = 0,
    command = '',
    x = 0,
    y = 0,
    start = [0, 0];
  context.beginPath();
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) command = tokens[i++];
    const relative = command === command.toLowerCase(),
      op = command.toUpperCase();
    if (op === 'Z') {
      context.closePath();
      [x, y] = start;
      command = '';
      continue;
    }
    if (!['M', 'L', 'H', 'V'].includes(op)) break;
    let nx = x,
      ny = y;
    if (op === 'H') nx = Number(tokens[i++]) + (relative ? x : 0);
    else if (op === 'V') ny = Number(tokens[i++]) + (relative ? y : 0);
    else {
      nx = Number(tokens[i++]) + (relative ? x : 0);
      ny = Number(tokens[i++]) + (relative ? y : 0);
    }
    if (op === 'M') {
      context.moveTo(nx, ny);
      start = [nx, ny];
      command = relative ? 'l' : 'L';
    } else context.lineTo(nx, ny);
    x = nx;
    y = ny;
  }
}
function paintSvg(context, svg, parentMatrix, bounds, svgStyle) {
  const width = number(svgStyle.width),
    height = number(svgStyle.height),
    box = svg.viewBox.baseVal;
  if (!width || !height || !box.width || !box.height) return;
  const center = parentMatrix
    .inverse()
    .transformPoint(new DOMPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  const scale = Math.min(width / box.width, height / box.height);
  const rootMatrix = parentMatrix
    .translate(
      center.x / center.w - (box.width * scale) / 2,
      center.y / center.w - (box.height * scale) / 2,
    )
    .scale(scale)
    .translate(-box.x, -box.y);
  for (const element of svg.querySelectorAll('path,rect,circle,line,polygon,polyline')) {
    const style = getComputedStyle(element);
    let matrix = rootMatrix;
    const chain = [];
    for (let node = element; node && node !== svg; node = node.parentElement) chain.unshift(node);
    for (const node of chain) {
      const transform = node.transform?.baseVal.consolidate()?.matrix;
      if (transform)
        matrix = matrix.multiply(
          new DOMMatrix([
            transform.a,
            transform.b,
            transform.c,
            transform.d,
            transform.e,
            transform.f,
          ]),
        );
    }
    if (!matrix || style.display === 'none' || style.visibility === 'hidden') continue;
    context.save();
    context.setProjectiveTransform(matrix);
    context.globalAlpha *= number(style.opacity || 1);
    context.beginPath();
    const attr = (name) => number(element.getAttribute(name));
    if (element.tagName === 'path') pathData(context, element.getAttribute('d') || '');
    else if (element.tagName === 'rect')
      context.rect(attr('x'), attr('y'), attr('width'), attr('height'));
    else if (element.tagName === 'circle')
      context.arc(attr('cx'), attr('cy'), attr('r'), 0, Math.PI * 2);
    else if (element.tagName === 'line') {
      context.moveTo(attr('x1'), attr('y1'));
      context.lineTo(attr('x2'), attr('y2'));
    } else {
      const points = (element.getAttribute('points') || '').match(/[-\d.]+/g)?.map(Number) || [];
      for (let i = 0; i < points.length; i += 2)
        i ? context.lineTo(points[i], points[i + 1]) : context.moveTo(points[i], points[i + 1]);
      if (element.tagName === 'polygon') context.closePath();
    }
    if (style.fill !== 'none') {
      context.fillStyle = style.fill;
      context.fill();
    }
    if (style.stroke !== 'none' && number(style.strokeWidth) > 0) {
      context.strokeStyle = style.stroke;
      context.lineWidth = number(style.strokeWidth);
      context.setLineDash(
        style.strokeDasharray === 'none' ? [] : style.strokeDasharray.split(/[ ,]+/).map(number),
      );
      context.stroke();
    }
    context.restore();
  }
}
function paintText(context, element, node, matrix, style, rect) {
  const text = node.textContent.replace(/\s+/g, ' ');
  if (!text.trim()) return;
  if (!rect.width || !rect.height) return;
  const size = number(style.fontSize),
    lineHeight = style.lineHeight === 'normal' ? size * 1.2 : number(style.lineHeight),
    paddingLeft = number(style.paddingLeft),
    paddingTop = number(style.paddingTop),
    width = Math.max(
      1,
      (element.clientWidth || element.offsetWidth) - paddingLeft - number(style.paddingRight),
    );
  context.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
  context.fillStyle = style.color;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  // Most cockpit labels are leaf elements. Mixed inline nodes use their browser text range.
  let x = paddingLeft,
    y = paddingTop + size * 0.85;
  if (element.childNodes.length > 1) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const box = range.getBoundingClientRect(),
      point = matrix.inverse().transformPoint(new DOMPoint(box.x, box.y));
    x = point.x;
    y = point.y + size * 0.85;
  }
  const lines = [];
  let line = '';
  if (style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre') lines.push(text.trim());
  else
    for (const word of text.trim().split(' ')) {
      if (line && context.measureText(line + ' ' + word).width > width) {
        lines.push(line);
        line = word;
      } else line += (line ? ' ' : '') + word;
    }
  if (line) lines.push(line);
  for (const rawLine of lines) {
    const line =
      style.textOverflow === 'ellipsis'
        ? ellipsizeText(rawLine, width, (text) => context.measureText(text).width)
        : rawLine;
    const textWidth = context.measureText(line).width;
    let tx = x;
    if (style.textAlign === 'center') tx += Math.max(0, (width - textWidth) / 2);
    else if (style.textAlign === 'right') tx += Math.max(0, width - textWidth);
    context.save();
    context.setProjectiveTransform(matrix);
    context.fillText(line, tx, y);
    context.restore();
    y += lineHeight;
  }
}
export class FlightInstrumentLayer {
  constructor(renderer) {
    this.renderer = renderer;
    this.root = document.getElementById('flight-ui');
    this.active = !!renderer.ctx.surface;
    if (this.active) {
      document.body.classList.add('webgpu-flight');
      this.canvas = document.createElement('canvas');
      this.painter = drawingContext(this.canvas);
      this.painter.surface.textureOnly = true;
      this.painter.surface.profile = !!renderer.ctx.surface.profile;
      this.records = new Map();
      this.messageRecords = new Map();
      this.svgRecords = new RetainedSvg();
      this.canvasRevisions = new WeakMap();
      this.canvasTextures = new WeakMap();
      this.dirty = new Set();
      this.observer = new MutationObserver((changes) => {
        for (const change of changes) {
          if (
            change.type === 'attributes' &&
            change.target.getAttribute(change.attributeName) === change.oldValue
          )
            continue;
          const target =
            change.target.nodeType === Node.ELEMENT_NODE
              ? change.target
              : change.target.parentElement;
          const svg = target?.closest?.('svg');
          if (svg) this.svgRecords.invalidate(svg);
          else if (
            change.type === 'attributes' &&
            ['style', 'class', 'hidden'].includes(change.attributeName)
          )
            this.svgRecords.invalidateTree(target);
          if (
            change.type === 'attributes' &&
            !svg &&
            !['style', 'class', 'hidden', 'width', 'height'].includes(change.attributeName) &&
            !change.attributeName.startsWith('data-')
          )
            continue;
          if (target?.closest('.flight-message')) continue;
          for (const region of this.records.keys())
            if (region.contains(target) || target?.contains(region)) this.dirty.add(region);
        }
      });
      this.observer.observe(this.root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeOldValue: true,
      });
      this.observer.observe(document.body, {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['class', 'style'],
      });
    }
  }
  // Called before joining a live room: image decode and the first GPU upload
  // must not compete with the first control/flight frames. This does not expose
  // hidden HUD controls or retain geometry measured from a hidden layout.
  async prepareAssets() {
    if (!this.active || !this.root) return;
    await this.painter.surface.ready;
    await this.painter.atlasReady;
    await document.fonts?.ready;
    const urls = new Set();
    for (const element of [this.root, ...this.root.querySelectorAll('[id]')]) {
      const url = getComputedStyle(element).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
      if (url) urls.add(url);
    }
    for (const url of urls) {
      imageFor(url);
      const image = imageCache.get(url);
      try {
        await image.decode();
        if (image.naturalWidth) this.painter.externalTexture(image);
      } catch {
        // A missing decorative image keeps the existing untextured fallback.
      }
    }
  }
  render() {
    if (!this.active || !this.root || this.root.hidden) return;
    if (!this.painter.atlas) return;
    const width = this.renderer.w,
      height = this.renderer.h,
      pixelWidth = this.renderer.canvas.width,
      pixelHeight = this.renderer.canvas.height,
      regions = [...this.root.children]
        .flatMap((element) => (element.id === 'cockpit' ? [...element.children] : [element]))
        .filter((element) => !['radio-message-feed', 'flight-message-feed'].includes(element.id));
    const resized =
      this.canvas.width !== pixelWidth ||
      this.canvas.height !== pixelHeight ||
      this.cssWidth !== width ||
      this.cssHeight !== height;
    if (resized) {
      this.cssWidth = width;
      this.cssHeight = height;
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      for (const record of this.records.values()) record?.buffer?.destroy();
      this.records.clear();
      this.messageRecords.clear();
      this.svgRecords.clear();
    }
    for (const region of this.records.keys())
      if (!regions.includes(region)) {
        this.records.get(region)?.buffer?.destroy();
        this.records.delete(region);
      }
    for (const region of regions)
      if (!this.records.has(region)) {
        this.records.set(region, null);
        this.dirty.add(region);
      }
    if (this.imageRevision !== imageRevision) {
      this.imageRevision = imageRevision;
      for (const region of regions) this.dirty.add(region);
    }
    // Resizing destroys the old source texture. Any retained panel referencing
    // it must be rebuilt before submission, even if the normal redraw budget expires.
    const urgent = new Set();
    // Canvas pixels can change without a DOM mutation (for example moving radar contacts).
    for (const canvas of this.root.querySelectorAll('canvas')) {
      const source = drawingContext(canvas);
      source.surface.textureOnly = true;
      source.flush();
      const textureChanged = this.canvasTextures.get(canvas) !== source.surface.target;
      this.canvasTextures.set(canvas, source.surface.target);
      if (textureChanged)
        for (const region of regions) if (region.contains(canvas)) urgent.add(region);
      if (textureChanged || this.canvasRevisions.get(canvas) !== source.surface.revision) {
        this.canvasRevisions.set(canvas, source.surface.revision);
        for (const region of regions) if (region.contains(canvas)) this.dirty.add(region);
      }
    }
    const context = this.painter;
    context.coordinateScale = pixelWidth / width;
    let changed = resized,
      painted = 0;
    const start = performance.now();
    const costs = [],
      matrixCache = new Map();
    // Apply the redraw budget to startup too; resized texture references stay urgent.
    for (const region of new Set([...urgent, ...this.dirty])) {
      // A coalesced DOM fit commits next frame. Reuse the last complete panel
      // meanwhile; resized canvas references still require an urgent rebuild.
      if (!urgent.has(region) && region.querySelector?.('[data-layout-pending]')) continue;
      this.dirty.delete(region);
      if (!this.records.has(region)) continue;
      const regionStart = performance.now();
      const buffer = this.records.get(region)?.buffer;
      this.records.set(region, {
        ...context.capture(() => this.paint(context, region, matrixCache)),
        buffer,
      });
      changed = true;
      painted++;
      costs.push([region.id || region.className, performance.now() - regionStart]);
      urgent.delete(region);
      if (!urgent.size && performance.now() - start >= 3) break;
    }
    if (changed) {
      context.clearRect(0, 0, pixelWidth, pixelHeight);
      context.renderRecords(regions.map((region) => this.records.get(region)));
    }
    this.metrics = {
      painted,
      pending: this.dirty.size,
      ms: performance.now() - start,
      costs,
      surfaceTasks: this.painter.surface?.profileMetrics,
    };
    this.renderer.ctx.drawImage(this.canvas, 0, 0, width, height);
    // Browser CSS transitions remain smooth while the unchanged text stays on the GPU.
    const output = this.renderer.ctx;
    output.save();
    output.resetTransform();
    output.coordinateScale = pixelWidth / width;
    for (const message of this.messageRecords.keys())
      if (!message.isConnected) this.messageRecords.delete(message);
    for (const host of this.root.querySelectorAll('#flight-message-feed, #radio-message-feed')) {
      const bounds = host.getBoundingClientRect();
      output.save();
      output.beginPath();
      output.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      output.clip();
      const cache = new Map();
      for (const message of host.children) {
        const rect = message.getBoundingClientRect(),
          style = getComputedStyle(message),
          key = `${message.textContent}:${message.dataset.level}:${style.font}:${style.color}:${message.offsetWidth}:${message.offsetHeight}:${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`;
        let record = this.messageRecords.get(message);
        if (!record || record.key !== key) {
          record = {
            ...output.capture(() => this.paint(output, message, cache, true)),
            key,
            x: rect.x,
            y: rect.y,
          };
          this.messageRecords.set(message, record);
        }
        output.replay(record, {
          x: (rect.x - record.x) * output.coordinateScale,
          y: (rect.y - record.y) * output.coordinateScale,
          alpha: number(style.opacity),
        });
      }
      output.restore();
    }
    output.restore();
  }
  paint(context, root, cache = new Map(), messages = false) {
    context.save();
    context.resetTransform();
    context.globalAlpha = 1;
    const visit = (element) => {
      if (element.hidden) return;
      if (!messages && element.classList.contains('flight-message')) return;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const rect = element.getBoundingClientRect();
      if ((rect.width <= 0 || rect.height <= 0) && !element.children.length) return;
      if (element instanceof SVGElement) {
        if (element.tagName === 'svg') {
          const matrix = matrixFor(element.parentElement, cache);
          const key = [
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            matrix.toString(),
            context.globalAlpha,
          ].join(':');
          this.svgRecords.paint(context, element, key, () =>
            paintSvg(context, element, matrix, rect, style),
          );
        }
        return;
      }
      const matrix = matrixFor(element, cache, style),
        w = element.offsetWidth,
        h = element.offsetHeight;
      context.save();
      if (element !== this.root && !(messages && element === root))
        context.globalAlpha *= number(style.opacity || 1);
      if (style.backgroundColor !== 'rgba(0, 0, 0, 0)')
        quad(context, matrix, 0, 0, w, h, style.backgroundColor);
      const url = style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1],
        image = url && imageFor(url);
      if (image) {
        const sizes = style.backgroundSize.split(' '),
          height = sizes[1]?.endsWith('%') ? (h * number(sizes[1])) / 100 : h;
        context.save();
        context.setProjectiveTransform(matrix);
        context.drawImage(image, 0, h - height, w, height);
        context.restore();
      }
      for (const [side, x, y, bw, bh] of [
        ['Top', 0, 0, w, number(style.borderTopWidth)],
        ['Bottom', 0, h - number(style.borderBottomWidth), w, number(style.borderBottomWidth)],
        ['Left', 0, 0, number(style.borderLeftWidth), h],
        ['Right', w - number(style.borderRightWidth), 0, number(style.borderRightWidth), h],
      ])
        if (bw && bh) quad(context, matrix, x, y, bw, bh, style['border' + side + 'Color']);
      if (element instanceof HTMLCanvasElement) {
        const c = drawingContext(element);
        if (c.surface) {
          c.surface.textureOnly = true;
          c.flush();
          context.save();
          context.setProjectiveTransform(matrix);
          context.drawImage(element, 0, 0, w, h);
          context.restore();
        }
      } else
        for (const node of element.childNodes)
          if (node.nodeType === Node.TEXT_NODE)
            paintText(context, element, node, matrix, style, rect);
          else if (node.nodeType === Node.ELEMENT_NODE) visit(node);
      context.restore();
    };
    visit(root);
    context.restore();
  }
}
