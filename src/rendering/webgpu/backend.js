import { meshBuffers, rotationMatrix, meshBounds } from '../shared/meshData.js';
import { terrainBuffers } from '../shared/terrainData.js';
import { featureWindow, buildFeatureBuffers, featurePatchInView } from '../shared/featureData.js';
import { materialPixels } from '../shared/materialPixels.js';
import { rgba } from '../shared/shapes.js';
import { surfaceStyle, materialIds } from '../../surfaceStyle.js';
import { cachedFeatureVisible } from '../../terrainFeatures.js';
import { uploadBuffer } from './device.js';
import * as shaders from './shaders.js';
let panorama;
function horizonImage() {
  if (!panorama) {
    panorama = new Image();
    panorama.src = '/assets/environment/horizon-mountains.png';
  }
  return panorama.complete && panorama.naturalWidth ? panorama : null;
}
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export function paddedMatrix(matrix) {
  return [
    matrix[0],
    matrix[1],
    matrix[2],
    0,
    matrix[3],
    matrix[4],
    matrix[5],
    0,
    matrix[6],
    matrix[7],
    matrix[8],
    0,
  ];
}
export function projection(focal, width, height, near = 1, far = 200000) {
  return [
    (2 * focal) / width,
    (2 * focal) / height,
    far / (far - near),
    (-far * near) / (far - near),
  ];
}
export class WebGPUBackend {
  constructor(context) {
    this.context = context;
    this.surface = context.surface;
    this.name = 'WebGPU';
    this.cache = new WeakMap();
    this.resources = new Set();
    this.textures = new Map();
    this.bindingCache = new WeakMap();
    this.frame = 0;
    this.ready = false;
    this.initialization = this.surface.ready.then(() => this.initialize());
    this.initialization.catch((error) => {
      this.error = error;
    });
  }
  get lost() {
    return !!this.error || !!this.surface.runtime?.lost;
  }
  get available() {
    return this.ready && !this.lost;
  }
  initialize() {
    const d = (this.device = this.surface.device);
    this.uniformStride =
      Math.ceil(320 / d.limits.minUniformBufferOffsetAlignment) *
      d.limits.minUniformBufferOffsetAlignment;
    this.uniformBuffer = d.createBuffer({
      size: this.uniformStride * 8192,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.uniformStaging = new Float32Array((this.uniformStride * 8192) / 4);
    this.layout = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 288 },
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    this.featureLayout = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 288 },
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
    this.sampler = d.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      minFilter: 'linear',
      magFilter: 'linear',
      mipmapFilter: 'linear',
      maxAnisotropy: 4,
    });
    this.horizonSampler = d.createSampler({ minFilter: 'linear', magFilter: 'linear' });
    const modelLayout = {
        arrayStride: 20,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x2' },
        ],
      },
      terrainLayout = {
        arrayStride: 24,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
        ],
      },
      featureLayout = {
        arrayStride: 36,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32' },
          { shaderLocation: 3, offset: 28, format: 'float32' },
          { shaderLocation: 4, offset: 32, format: 'float32' },
        ],
      };
    this.modelPipeline = this.pipeline(shaders.models, [modelLayout], { bias: true });
    this.asphaltPipeline = this.pipeline(shaders.models, [modelLayout]);
    this.edgePipeline = this.pipeline(shaders.models, [modelLayout], { lines: true });
    this.depthPipeline = this.pipeline(shaders.models, [modelLayout], { mask: true });
    this.terrainPipeline = this.pipeline(shaders.terrain, [terrainLayout], {
      bias: true,
      blend: true,
    });
    this.terrainEdgePipeline = this.pipeline(shaders.terrain, [terrainLayout], {
      lines: true,
      blend: true,
    });
    this.featurePipeline = this.pipeline(shaders.features, [featureLayout], {
      noDepth: true,
      blend: true,
      layout: this.featureLayout,
    });
    this.horizonPipeline = this.pipeline(shaders.horizon, [], { noDepth: true, blend: true });
    this.ready = true;
  }
  pipeline(
    code,
    buffers,
    {
      lines = false,
      bias = false,
      mask = false,
      noDepth = false,
      blend = false,
      layout = this.layout,
    } = {},
  ) {
    const d = this.device,
      module = d.createShaderModule({ code: 'diagnostic(off, derivative_uniformity);\n' + code });
    module.getCompilationInfo().then((info) => {
      for (const m of info.messages)
        if (m.type === 'error') {
          this.error = new Error(m.message);
          console.error('WGSL:', m.lineNum, m.message);
        }
    });
    const target = { format: this.surface.runtime.format, writeMask: mask ? 0 : GPUColorWrite.ALL };
    if (blend)
      target.blend = {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      };
    const descriptor = {
      layout: d.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: { module, entryPoint: 'vs', buffers },
      fragment: { module, entryPoint: 'fs', targets: [target] },
      multisample: { count: 4 },
      primitive: { topology: lines ? 'line-list' : 'triangle-list', cullMode: 'none' },
    };
    if (!noDepth)
      descriptor.depthStencil = {
        format: 'depth24plus',
        depthWriteEnabled: !lines,
        depthCompare: 'less-equal',
        depthBias: bias ? 1 : 0,
        depthBiasSlopeScale: bias ? 1 : 0,
      };
    return d.createRenderPipeline(descriptor);
  }
  texture(kind) {
    if (this.textures.has(kind)) return this.textures.get(kind);
    const d = this.device,
      size = kind === 'hangar' ? 512 : 256,
      mips = Math.log2(size) + 1,
      t = d.createTexture({
        size: [size, size],
        mipLevelCount: mips,
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
    let pixels = materialPixels(kind, size),
      width = size;
    for (let level = 0; level < mips; level++) {
      d.queue.writeTexture({ texture: t, mipLevel: level }, pixels, { bytesPerRow: width * 4 }, [
        width,
        width,
      ]);
      if (width === 1) break;
      const next = new Uint8Array(width * width),
        n = width / 2;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++)
          for (let c = 0; c < 4; c++)
            next[(y * n + x) * 4 + c] =
              (pixels[(y * 2 * width + x * 2) * 4 + c] +
                pixels[(y * 2 * width + x * 2 + 1) * 4 + c] +
                pixels[((y * 2 + 1) * width + x * 2) * 4 + c] +
                pixels[((y * 2 + 1) * width + x * 2 + 1) * 4 + c]) /
              4;
      pixels = next;
      width = n;
    }
    this.textures.set(kind, t);
    return t;
  }
  bind(texture, mask = null, horizon = false) {
    let cached = this.bindingCache.get(texture);
    if (!cached) {
      cached = { masks: new WeakMap() };
      this.bindingCache.set(texture, cached);
    }
    const key = horizon ? 'horizon' : 'standard';
    const existing = mask ? cached.masks.get(mask) : cached[key];
    if (existing) return existing;
    const entries = [
      { binding: 0, resource: { buffer: this.uniformBuffer, size: 320 } },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: horizon ? this.horizonSampler : this.sampler },
    ];
    if (mask) entries.push({ binding: 3, resource: { buffer: mask } });
    const binding = this.device.createBindGroup({
      layout: mask ? this.featureLayout : this.layout,
      entries,
    });
    if (mask) cached.masks.set(mask, binding);
    else cached[key] = binding;
    return binding;
  }
  frameUniform(r) {
    const data = new Float32Array(80),
      style = surfaceStyle(r.surfaceMode);
    data.set(paddedMatrix([r.r.x, r.u.x, r.f.x, r.r.y, r.u.y, r.f.y, r.r.z, r.u.z, r.f.z]), 0);
    data.set(paddedMatrix(identity), 12);
    data.set(projection(r.focal, r.w, r.h), 28);
    data.set([1, 1, 1, 0], 32);
    data.set([1, 1, 1, 1], 36);
    data.set([1, 1, 1, 0], 44);
    data.set(
      [style.light, r.surfaceMode && r.surfaceMode !== 'vector' ? 1 : 0, 0, style.textureScale],
      48,
    );
    data.set([style.rockiness, style.snow, style.snowLine, style.snowRange], 52);
    data.set(style.terrain, 56);
    data[59] = r.surfaceMode === 'ocean' ? 1 : 0;
    data.set(style.rock, 60);
    data.set(rgba(style.sky[2]).slice(0, 3), 64);
    data[67] = style.hazeDistance;
    data.set([r.w, r.h, r.focal, Math.atan2(Math.max(0, r.camera.y), 120000)], 68);
    data[47] = this.surface.width / r.w;
    return data;
  }
  begin() {
    this.context.flush();
    this.surface.resize();
    this.uniformCount = 0;
    return this.device.createCommandEncoder();
  }
  uniform(data) {
    const index = this.uniformCount++;
    if (index >= 8192) throw new Error('WebGPU uniform draw budget exceeded');
    this.uniformStaging.set(data, (index * this.uniformStride) / 4);
    return index * this.uniformStride;
  }
  submit(encoder) {
    const bytes = this.uniformCount * this.uniformStride;
    if (bytes)
      this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformStaging.buffer, 0, bytes);
    this.device.queue.submit([encoder.finish()]);
    this.surface.schedule();
  }
  upload(mesh) {
    let item = this.cache.get(mesh);
    if (item && !item.disposed) {
      item.used = this.frame;
      return item;
    }
    const values = meshBuffers(mesh),
      d = this.device,
      buffers = [];
    const upload = (v, usage) => {
      const b = uploadBuffer(d, v, usage);
      buffers.push(b);
      return b;
    };
    const { mins, sizes } = meshBounds(mesh);
    item = {
      vertices: upload(values.vertices, GPUBufferUsage.VERTEX),
      triangles: upload(values.triangles, GPUBufferUsage.INDEX),
      edges: upload(values.edges, GPUBufferUsage.INDEX),
      details: upload(values.details, GPUBufferUsage.INDEX),
      triangleCount: values.triangles.length,
      flapCount: values.flapCount,
      edgeCount: values.edges.length,
      detailCount: values.details.length,
      mins,
      sizes,
      buffers,
      used: this.frame,
    };
    this.cache.set(mesh, item);
    this.resources.add(item);
    return item;
  }
  updateTerrain(r) {
    if (this.terrainKey === r.terrainSurfaceKey) return;
    this.terrainFill?.destroy();
    this.terrainLines?.destroy();
    this.terrainMask?.destroy();
    const data = terrainBuffers(r.terrainSurface),
      lines = new Float32Array(data.lines.length * 2),
      mask = new Float32Array(r.terrainSurface.length * 15);
    for (let i = 0; i < data.lines.length / 3; i++)
      lines.set(data.lines.subarray(i * 3, i * 3 + 3), i * 6);
    let cursor = 0;
    for (const face of r.terrainSurface)
      for (const p of face.points) {
        mask.set([p.x, p.y, p.z, 0, 0], cursor);
        cursor += 5;
      }
    this.terrainFill = uploadBuffer(this.device, data.fills, GPUBufferUsage.VERTEX);
    this.terrainLines = uploadBuffer(this.device, lines, GPUBufferUsage.VERTEX);
    this.terrainMask = uploadBuffer(this.device, mask, GPUBufferUsage.VERTEX);
    this.terrainCount = data.fills.length / 6;
    this.terrainLineCount = data.lines.length / 3;
    this.terrainKey = r.terrainSurfaceKey;
  }
  renderHorizon(r) {
    if (!this.available) return false;
    const image = horizonImage();
    if (!image) return false;
    if (!this.panorama) {
      const d = this.device;
      this.panorama = d.createTexture({
        size: [image.naturalWidth, image.naturalHeight],
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      d.queue.copyExternalImageToTexture({ source: image }, { texture: this.panorama }, [
        image.naturalWidth,
        image.naturalHeight,
      ]);
    }
    const encoder = this.begin(),
      pass = this.surface.pass(encoder),
      data = this.frameUniform(r);
    data.set(paddedMatrix([r.r.x, r.r.y, r.r.z, r.u.x, r.u.y, r.u.z, r.f.x, r.f.y, r.f.z]), 12);
    data.set(rgba(surfaceStyle(r.surfaceMode).sky[1]).slice(0, 3), 64);
    data[35] = r.surfaceMode === 'ocean' ? 1 : 0;
    pass.setPipeline(this.horizonPipeline);
    pass.setBindGroup(0, this.bind(this.panorama, null, true), [this.uniform(data)]);
    pass.draw(3);
    pass.end();
    this.submit(encoder);
    return true;
  }
  renderTerrain(r) {
    if (!this.available) return false;
    this.updateTerrain(r);
    const encoder = this.begin(),
      pass = this.surface.pass(encoder, true),
      data = this.frameUniform(r);
    data.set([r.camera.x, r.camera.y, r.camera.z], 24);
    const bind = this.bind(
      this.texture(
        r.surfaceMode === 'ocean' ? 'terrain-sand' : surfaceStyle(r.surfaceMode).texture,
      ),
    );
    pass.setPipeline(this.terrainPipeline);
    pass.setBindGroup(0, bind, [this.uniform(data)]);
    pass.setVertexBuffer(0, this.terrainFill);
    pass.draw(this.terrainCount);
    if (r.surfaceLines !== false) {
      const wire = new Float32Array(data);
      wire[50] = 1;
      pass.setPipeline(this.terrainEdgePipeline);
      pass.setBindGroup(0, bind, [this.uniform(wire)]);
      pass.setVertexBuffer(0, this.terrainLines);
      pass.draw(this.terrainLineCount);
    }
    pass.end();
    this.submit(encoder);
    if (r.debugMetrics)
      r.terrainMetrics = {
        backend: 'WebGPU',
        triangles: this.terrainCount / 3,
        edges: r.surfaceLines === false ? 0 : this.terrainLineCount / 2,
      };
    return true;
  }
  finishEnvironment(r) {
    if (!this.available) return false;
    const window = featureWindow(r.camera, this.window);
    this.window = window;
    if (this.featureKey !== window.key) {
      this.featureBuffer?.destroy();
      this.featureMask?.destroy();
      const data = buildFeatureBuffers(r.camera, window);
      this.featureBuffer = uploadBuffer(this.device, data.vertices, GPUBufferUsage.VERTEX);
      this.patches = data.patches;
      this.featureCount = data.vertices.length / 9;
      this.visibility = new Uint32Array(Math.max(1, this.patches.length));
      this.featureMask = uploadBuffer(this.device, this.visibility, GPUBufferUsage.STORAGE);
      this.featureKey = data.key;
      this.featureUploads = (this.featureUploads || 0) + 1;
    }
    if (!this.featureCount) {
      if (r.debugMetrics)
        r.featureMetrics = { backend: 'WebGPU', triangles: 0, uploads: this.featureUploads };
      return true;
    }
    this.patches.forEach((p, i) => {
      this.visibility[i] =
        featurePatchInView(r, p) && cachedFeatureVisible(r.camera, p.center) ? 1 : 0;
    });
    this.device.queue.writeBuffer(this.featureMask, 0, this.visibility);
    const encoder = this.begin(),
      pass = this.surface.pass(encoder),
      data = this.frameUniform(r);
    data.set([r.camera.x, r.camera.y, r.camera.z], 24);
    pass.setPipeline(this.featurePipeline);
    pass.setBindGroup(0, this.bind(this.texture('concrete'), this.featureMask), [
      this.uniform(data),
    ]);
    pass.setVertexBuffer(0, this.featureBuffer);
    pass.draw(this.featureCount);
    pass.end();
    this.submit(encoder);
    if (r.debugMetrics)
      r.featureMetrics = {
        backend: 'WebGPU',
        triangles: this.featureCount / 3,
        uploads: this.featureUploads,
      };
    return true;
  }
  render(r, entries) {
    if (!this.available) return false;
    this.frame++;
    const encoder = this.begin(),
      pass = this.surface.pass(encoder, true),
      base = this.frameUniform(r),
      visible = [];
    if (r.worldOcclusion && r.terrainSurface) {
      this.updateTerrain(r);
      const data = new Float32Array(base);
      data.set([-r.camera.x, -r.camera.y, -r.camera.z], 24);
      pass.setPipeline(this.depthPipeline);
      pass.setBindGroup(0, this.bind(this.texture('concrete')), [this.uniform(data)]);
      pass.setVertexBuffer(0, this.terrainMask);
      pass.draw(this.terrainCount);
    }
    for (const entry of entries) {
      const p = r.local(entry.position),
        radius = meshBounds(entry.mesh).radius * entry.scale;
      if (
        p.z + radius < 1 ||
        Math.abs(p.x) > (p.z * r.w) / (2 * r.focal) + radius * Math.hypot(1, r.w / (2 * r.focal)) ||
        Math.abs(p.y) >
          (p.z * r.h * 0.53) / r.focal + radius * Math.hypot(1, (r.h * 0.53) / r.focal)
      )
        continue;
      visible.push([entry, this.upload(entry.mesh)]);
    }
    const transformed = (e, item) => {
      const data = new Float32Array(base);
      data.set(paddedMatrix(rotationMatrix(e.q)), 12);
      data.set(
        [e.position.x - r.camera.x, e.position.y - r.camera.y, e.position.z - r.camera.z],
        24,
      );
      data.set(
        [e.condition?.parts.leftWing ?? 1, e.condition?.parts.rightWing ?? 1, e.scale, 0],
        32,
      );
      data.set(item.mins, 40);
      data.set(item.sizes, 44);
      data[47] = this.surface.width / r.w;
      return data;
    };
    for (const record of visible) {
      const [e, item] = record;
      const data = transformed(e, item),
        material =
          item.triangleCount &&
          !(e.material === 'paint' || e.material === 'lamp') &&
          r.surfaceMode &&
          r.surfaceMode !== 'vector'
            ? e.material || 'concrete'
            : null;
      record[2] = data;
      data[35] = material ? materialIds[material] || 3 : 0;
      data.set(rgba(e.material === 'paint' || e.material === 'lamp' ? e.color : '#101c16'), 36);
      pass.setPipeline(
        e.material === 'asphalt' || e.material === 'paint'
          ? this.asphaltPipeline
          : this.modelPipeline,
      );
      const bind = this.bind(this.texture(material || 'concrete'));
      pass.setVertexBuffer(0, item.vertices);
      pass.setIndexBuffer(item.triangles, 'uint32');
      pass.setBindGroup(0, bind, [this.uniform(data)]);
      if (item.triangleCount - item.flapCount)
        pass.drawIndexed(item.triangleCount - item.flapCount);
      if (item.flapCount) {
        const flap = new Float32Array(data);
        flap.set(rgba('#40522b'), 36);
        pass.setBindGroup(0, bind, [this.uniform(flap)]);
        pass.drawIndexed(item.flapCount, 1, item.triangleCount - item.flapCount);
      }
    }
    pass.setPipeline(this.edgePipeline);
    for (const [e, item, data] of visible) {
      if (e.material === 'paint' || e.material === 'lamp') continue;
      const wire = r.surfaceLines !== false || e.material === 'runway',
        count = wire ? item.edgeCount : item.detailCount;
      if (!count) continue;
      data.set(
        rgba(
          e.material === 'runway'
            ? e.color
            : r.surfaceMode && r.surfaceMode !== 'vector'
              ? '#56605c'
              : e.color,
        ),
        36,
      );
      pass.setVertexBuffer(0, item.vertices);
      pass.setIndexBuffer(wire ? item.edges : item.details, 'uint32');
      pass.setBindGroup(0, this.bind(this.texture('concrete')), [this.uniform(data)]);
      pass.drawIndexed(count);
    }
    pass.end();
    this.submit(encoder);
    if (r.debugMetrics)
      r.modelMetrics = {
        backend: 'WebGPU',
        entries: entries.length,
        visible: visible.length,
        triangles: visible.reduce((n, [, d]) => n + d.triangleCount / 3, 0),
        edges: visible.reduce(
          (n, [e, d]) =>
            n +
            (r.surfaceLines !== false || e.material === 'runway' ? d.edgeCount : d.detailCount) / 2,
          0,
        ),
      };
    if (this.frame % 120 === 0)
      for (const resource of this.resources)
        if (this.frame - resource.used > 120) {
          resource.buffers.forEach((b) => b.destroy());
          resource.disposed = true;
          this.resources.delete(resource);
        }
    return true;
  }
  destroy() {
    this.uniformBuffer?.destroy();
    for (const item of this.resources) item.buffers.forEach((b) => b.destroy());
    this.resources.clear();
    for (const t of this.textures.values()) t.destroy();
    for (const key of [
      'terrainFill',
      'terrainLines',
      'terrainMask',
      'featureBuffer',
      'featureMask',
      'panorama',
    ])
      this[key]?.destroy();
  }
}
