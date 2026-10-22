import { GpuModels } from './webgl/models.js';
import { vectorContext } from './webgpu/vectorContext.js';
import { WebGPUBackend } from './webgpu/backend.js';
export function requestedBackend() {
  return typeof location === 'undefined'
    ? 'webgl'
    : new URLSearchParams(location.search).get('backend') || 'webgpu';
}
export function drawingContext(canvas) {
  return requestedBackend() === 'webgpu' && typeof document !== 'undefined'
    ? vectorContext(canvas)
    : canvas.getContext('2d');
}
export function createBackend(context) {
  if (context.surface) return new WebGPUBackend(context);
  if (requestedBackend() === 'cpu') return null;
  const backend = GpuModels.create();
  if (backend) backend.name = 'WebGL2';
  return backend;
}
export function backendAvailable(backend) {
  if (!backend || backend.lost) return false;
  return backend.name === 'WebGPU'
    ? backend.available
    : !!backend.gl && !backend.gl.isContextLost();
}
