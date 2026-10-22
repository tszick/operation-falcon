// One device is shared by all world, instrument and preview surfaces.
let runtime;
export function webgpuRuntime() {
  return (runtime ??= initialize());
}
async function initialize() {
  if (!globalThis.navigator?.gpu) throw new Error('WebGPU is unavailable in this browser.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter is available.');
  const device = await adapter.requestDevice();
  const state = {
    device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    lost: false,
    errors: [],
  };
  device.lost.then((info) => {
    state.lost = true;
    state.error = info.message || 'WebGPU device lost';
    runtime = null;
    globalThis.dispatchEvent?.(new CustomEvent('falcon:graphicslost', { detail: state.error }));
  });
  device.addEventListener('uncapturederror', (event) => {
    if (!state.errors.includes(event.error.message)) {
      state.errors.push(event.error.message);
      console.error('WebGPU validation:', event.error.message);
    }
  });
  return state;
}
export function uploadBuffer(device, values, usage) {
  const buffer = device.createBuffer({
    size: Math.max(4, (values.byteLength + 3) & ~3),
    usage: usage | GPUBufferUsage.COPY_DST,
  });
  if (values.byteLength) device.queue.writeBuffer(buffer, 0, values);
  return buffer;
}
export class Surface {
  constructor(canvas) {
    this.canvas = canvas;
    this.ready = webgpuRuntime()
      .then((runtime) => {
        this.runtime = runtime;
        this.device = runtime.device;
        this.context = canvas.getContext('webgpu');
        if (!this.context) throw new Error('Cannot create a WebGPU canvas context.');
        this.context.configure({
          device: this.device,
          format: runtime.format,
          alphaMode: 'premultiplied',
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
        });
        this.resize();
        this.onready?.();
        return this;
      })
      .catch((error) => {
        this.error = error;
        console.error(error);
        throw error;
      });
    // Consumers may await ready to display an explicit error. Avoid an unhandled startup rejection.
    this.ready.catch(() => {});
  }
  resize() {
    if (!this.device || this.runtime.lost) return false;
    const width = Math.max(1, this.canvas.width),
      height = Math.max(1, this.canvas.height);
    if (width === this.width && height === this.height) return true;
    this.target?.destroy();
    this.depth?.destroy();
    this.multisample?.destroy();
    this.width = width;
    this.height = height;
    this.target = this.device.createTexture({
      size: [width, height],
      format: this.runtime.format,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING,
    });
    this.multisample = this.device.createTexture({
      size: [width, height],
      format: this.runtime.format,
      sampleCount: 4,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depth = this.device.createTexture({
      size: [width, height],
      format: 'depth24plus',
      sampleCount: 4,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.clear = true;
    return true;
  }
  pass(encoder, depth = false, clearDepth = true) {
    this.revision = (this.revision || 0) + 1;
    const descriptor = {
      colorAttachments: [
        {
          view: this.multisample.createView(),
          resolveTarget: this.target.createView(),
          loadOp: this.clear ? 'clear' : 'load',
          clearValue: [0, 0, 0, 0],
          storeOp: 'store',
        },
      ],
    };
    if (depth)
      descriptor.depthStencilAttachment = {
        view: this.depth.createView(),
        depthLoadOp: clearDepth ? 'clear' : 'load',
        depthClearValue: 1,
        depthStoreOp: 'store',
      };
    this.clear = false;
    return encoder.beginRenderPass(descriptor);
  }
  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.painter?.flush();
      this.present();
    });
  }
  present() {
    if (!this.canvas.isConnected || this.textureOnly) return;
    if (!this.resize()) return;
    const encoder = this.device.createCommandEncoder();
    encoder.copyTextureToTexture(
      { texture: this.target },
      { texture: this.context.getCurrentTexture() },
      [this.width, this.height],
    );
    this.device.queue.submit([encoder.finish()]);
  }
  destroy() {
    this.target?.destroy();
    this.depth?.destroy();
    this.multisample?.destroy();
    this.context?.unconfigure();
  }
}
