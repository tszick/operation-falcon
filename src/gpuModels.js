import { createShaderProgram } from './graphics/shaderProgram.js';
import { GpuFeatures } from './gpuFeatures.js';
import { SurfaceTextures, materialIds, surfaceStyle } from './surfaceStyle.js';
import { GpuHorizon, horizonImage } from './horizon.js';
import { GpuTerrain } from './gpuTerrain.js';
// WebGL2 performs model transforms, depth testing and hidden-edge rejection on the GPU.
// The transparent result is composited below the existing Canvas HUD/effects.
export function rotationMatrix(q) {
  const { x, y, z, w } = q;
  return new Float32Array([
    1 - 2 * (y * y + z * z),
    2 * (x * y + z * w),
    2 * (x * z - y * w),
    2 * (x * y - z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z + x * w),
    2 * (x * z + y * w),
    2 * (y * z - x * w),
    1 - 2 * (x * x + y * y),
  ]);
}
export function meshBuffers(mesh) {
  const vertices = new Float32Array(mesh.points.length * 5),
    left = new Set(mesh.wingPoints?.left || []),
    right = new Set(mesh.wingPoints?.right || []),
    triangles = [],
    flaps = [],
    edges = [],
    seen = new Set();
  mesh.points.forEach((p, i) =>
    vertices.set([p.x, p.y, p.z, left.has(i) ? 1 : 0, right.has(i) ? 1 : 0], i * 5),
  );
  const edge = (a, b) => {
    const pa = mesh.points[a],
      pb = mesh.points[b],
      key = [[pa.x, pa.y, pa.z].join(','), [pb.x, pb.y, pb.z].join(',')].sort().join('|');
    if (!seen.has(key)) {
      seen.add(key);
      edges.push(a, b);
    }
  };
  for (const face of mesh.faces || []) {
    const destination =
      mesh.flapFraction > 0.02 && mesh.flapFaces?.includes(face) ? flaps : triangles;
    for (let j = 1; j < face.length - 1; j++) destination.push(face[0], face[j], face[j + 1]);
    face.forEach((id, j) => edge(id, face[(j + 1) % face.length]));
  }
  for (const [a, b] of mesh.faces ? mesh.details || [] : mesh.edges || []) edge(a, b);
  return {
    vertices,
    triangles: new Uint32Array([...triangles, ...flaps]),
    flapCount: flaps.length,
    edges: new Uint32Array(edges),
    details: new Uint32Array((mesh.faces ? mesh.details || [] : mesh.edges || []).flat()),
  };
}
const vertex = `#version 300 es
precision highp float;
in vec3 position; in vec2 wing;out float wingHealth;out vec3 localPosition,worldPosition;
uniform mat3 rotation,view;uniform vec3 translation;uniform vec4 projection;uniform float scale;uniform vec2 integrity;
void main(){vec3 p=position;float health=wing.x>0.5?integrity.x:wing.y>0.5?integrity.y:1.0;wingHealth=health;
 if(health<0.8){float outer=max(0.0,abs(p.x)-1.2);p.x=sign(p.x)*(min(1.2,abs(p.x))+outer*(0.15+0.85*health));p.y-=outer*(1.0-health)*0.3;}
 localPosition=p;worldPosition=rotation*(p*scale);vec3 v=view*(worldPosition+translation);gl_Position=vec4(v.x*projection.x,v.y*projection.y-0.06*v.z,projection.z*v.z+projection.w,v.z);
}`;
const fragment = `#version 300 es
precision highp float;
uniform vec3 color;uniform int material;uniform sampler2D surfaceMap;uniform float daylight;uniform vec3 boundMin,boundSize;
in float wingHealth;in vec3 localPosition,worldPosition;out vec4 outColor;
void main(){if(wingHealth<0.09)discard;
 if(material==0){outColor=vec4(color,1.0);return;}
 vec3 n=normalize(cross(dFdx(localPosition),dFdy(localPosition))),a=abs(n);vec2 uv=a.y>a.x&&a.y>a.z?localPosition.xz:a.x>a.z?localPosition.zy:localPosition.xy;
 if(material==4){vec3 p=(localPosition-boundMin)/boundSize;uv=a.y>a.x&&a.y>a.z?vec2(0.03,p.z):a.x>a.z?vec2(p.z,1.0-p.y):vec2(p.x,1.0-p.y);}else uv*=material==1?0.12:material==2?0.15:0.08;
 float light=0.52+0.48*abs(dot(normalize(cross(dFdx(worldPosition),dFdy(worldPosition))),normalize(vec3(-0.36,0.86,-0.36))));
 outColor=vec4(texture(surfaceMap,uv).rgb*light*daylight,1.0);
}`;
export class GpuModels {
  static create() {
    try {
      return typeof document === 'undefined' ? null : new GpuModels();
    } catch {
      return null;
    }
  }
  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = (this.gl = this.canvas.getContext('webgl2', {
      alpha: true,
      depth: true,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    }));
    if (!gl) throw new Error('WebGL2 unavailable');
    this.cache = new WeakMap();
    this.resources = new Set();
    this.frame = 0;
    this.colors = new Map();
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.cache = new WeakMap();
      this.resources.clear();
      this.terrain = null;
      this.terrainKey = null;
      this.terrainPainter = null;
      this.terrainUnavailable = false;
      this.horizonPainter = null;
      this.horizonUnavailable = false;
      this.featurePainter = null;
      this.featuresUnavailable = false;
      this.environmentReady = null;
      this.pendingHorizon = null;
      this.init();
      this.lost = false;
    });
    this.init();
  }
  init() {
    const g = this.gl,
      program = (this.program = createShaderProgram(g, vertex, fragment));
    this.locations = {};
    for (const name of [
      'rotation',
      'view',
      'translation',
      'projection',
      'scale',
      'integrity',
      'color',
      'material',
      'surfaceMap',
      'daylight',
      'boundMin',
      'boundSize',
    ])
      this.locations[name] = g.getUniformLocation(program, name);
    this.surfaceTextures = new SurfaceTextures(g);
    this.position = g.getAttribLocation(program, 'position');
    this.wing = g.getAttribLocation(program, 'wing');
  }
  upload(mesh) {
    let cached = this.cache.get(mesh);
    if (cached && !cached.disposed) {
      cached.used = this.frame;
      return cached;
    }
    const g = this.gl,
      data = meshBuffers(mesh),
      buffers = [];
    const buffer = (target, array) => {
      const b = g.createBuffer();
      g.bindBuffer(target, b);
      g.bufferData(target, array, g.STATIC_DRAW);
      buffers.push(b);
      return b;
    };
    const mins = ['x', 'y', 'z'].map((k) => Math.min(...mesh.points.map((p) => p[k]))),
      sizes = ['x', 'y', 'z'].map((k, i) =>
        Math.max(0.01, Math.max(...mesh.points.map((p) => p[k])) - mins[i]),
      );
    cached = {
      mins,
      sizes,
      vertices: buffer(g.ARRAY_BUFFER, data.vertices),
      triangles: buffer(g.ELEMENT_ARRAY_BUFFER, data.triangles),
      edges: buffer(g.ELEMENT_ARRAY_BUFFER, data.edges),
      details: buffer(g.ELEMENT_ARRAY_BUFFER, data.details),
      detailCount: data.details.length,
      triangleCount: data.triangles.length,
      flapCount: data.flapCount,
      edgeCount: data.edges.length,
      buffers,
      used: this.frame,
    };
    this.cache.set(mesh, cached);
    this.resources.add(cached);
    return cached;
  }
  bind(data) {
    const g = this.gl;
    g.bindBuffer(g.ARRAY_BUFFER, data.vertices);
    g.enableVertexAttribArray(this.position);
    g.vertexAttribPointer(this.position, 3, g.FLOAT, false, 20, 0);
    g.enableVertexAttribArray(this.wing);
    g.vertexAttribPointer(this.wing, 2, g.FLOAT, false, 20, 12);
  }
  color(hex) {
    if (!this.colors.has(hex))
      this.colors.set(
        hex,
        [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255),
      );
    this.gl.uniform3fv(this.locations.color, this.colors.get(hex));
  }
  transform(r, e) {
    const g = this.gl,
      l = this.locations;
    g.uniformMatrix3fv(l.rotation, false, rotationMatrix(e.q));
    g.uniform3f(
      l.translation,
      e.position.x - r.camera.x,
      e.position.y - r.camera.y,
      e.position.z - r.camera.z,
    );
    g.uniform1f(l.scale, e.scale);
    g.uniform2f(l.integrity, e.condition?.parts.leftWing ?? 1, e.condition?.parts.rightWing ?? 1);
  }
  terrainDepth(r) {
    if (!r.worldOcclusion || !r.terrainSurface) return;
    const g = this.gl,
      l = this.locations;
    if (this.terrainKey !== r.terrainSurfaceKey) {
      if (this.terrain) g.deleteBuffer(this.terrain);
      const values = new Float32Array(r.terrainSurface.length * 9);
      let index = 0;
      for (const face of r.terrainSurface)
        for (const p of face.points) {
          values[index++] = p.x;
          values[index++] = p.y;
          values[index++] = p.z;
        }
      this.terrain = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, this.terrain);
      g.bufferData(g.ARRAY_BUFFER, values, g.STATIC_DRAW);
      this.terrainCount = index / 3;
      this.terrainKey = r.terrainSurfaceKey;
    }
    g.bindBuffer(g.ARRAY_BUFFER, this.terrain);
    g.enableVertexAttribArray(this.position);
    g.vertexAttribPointer(this.position, 3, g.FLOAT, false, 12, 0);
    g.disableVertexAttribArray(this.wing);
    g.vertexAttrib2f(this.wing, 0, 0);
    g.uniformMatrix3fv(l.rotation, false, new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
    g.uniform3f(l.translation, -r.camera.x, -r.camera.y, -r.camera.z);
    g.uniform1f(l.scale, 1);
    g.uniform2f(l.integrity, 1, 1);
    g.colorMask(false, false, false, false);
    g.drawArrays(g.TRIANGLES, 0, this.terrainCount);
    g.colorMask(true, true, true, true);
  }
  prepare(r, clear = true) {
    const g = this.gl;
    const width = Math.round(r.w),
      height = Math.round(r.h);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    g.depthMask(true);
    g.colorMask(true, true, true, true);
    g.viewport(0, 0, width, height);
    g.clearColor(0, 0, 0, 0);
    g.clearDepth(1);
    if (clear) g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
    g.useProgram(this.program);
    g.enable(g.DEPTH_TEST);
    g.depthFunc(g.LEQUAL);
    g.disable(g.BLEND);
    g.disable(g.CULL_FACE);
    g.disable(g.POLYGON_OFFSET_FILL);
  }
  renderHorizon(r, defer = false) {
    this.deferEnvironment = defer;
    this.pendingHorizon = null;
    if (this.lost || this.gl.isContextLost() || this.horizonUnavailable) return false;
    const image = horizonImage();
    if (!image) return false;
    try {
      this.horizonPainter ??= new GpuHorizon(this.gl, image);
    } catch {
      this.horizonUnavailable = true;
      return false;
    }
    this.prepare(r);
    this.horizonPainter.render(r);
    if (defer) this.pendingHorizon = r;
    else r.ctx.drawImage(this.canvas, 0, 0, r.w, r.h);
    return true;
  }
  renderTerrain(r) {
    if (this.lost || this.gl.isContextLost()) return false;
    // Flat open water is already drawn continuously to infinity by the sea panorama.
    // Keep terrain geometry for model depth occlusion, without repainting a finite blue square.
    if (r.surfaceMode === 'ocean' && this.pendingHorizon === r) {
      this.pendingHorizon = null;
      if (this.deferEnvironment) this.environmentReady = r;
      else r.ctx.drawImage(this.canvas, 0, 0, r.w, r.h);
      return true;
    }
    // A terrain-only failure keeps the CPU landscape available alongside GPU models.
    if (this.terrainUnavailable) {
      if (this.pendingHorizon === r) r.ctx.drawImage(this.canvas, 0, 0, r.w, r.h);
      this.pendingHorizon = null;
      return false;
    }
    try {
      this.terrainPainter ??= new GpuTerrain(this.gl);
    } catch {
      this.terrainUnavailable = true;
      if (this.pendingHorizon === r) r.ctx.drawImage(this.canvas, 0, 0, r.w, r.h);
      this.pendingHorizon = null;
      return false;
    }
    this.prepare(r, this.pendingHorizon !== r);
    this.pendingHorizon = null;
    this.terrainPainter.render(r);
    if (this.deferEnvironment) this.environmentReady = r;
    else r.ctx.drawImage(this.canvas, 0, 0, r.w, r.h);
    if (r.debugMetrics)
      r.terrainMetrics = {
        backend: 'WebGL2',
        triangles: this.terrainPainter.fillCount / 3,
        edges: r.surfaceLines === false ? 0 : this.terrainPainter.lineCount / 2,
      };
    return true;
  }
  finishEnvironment(r) {
    this.deferEnvironment = false;
    if (this.environmentReady !== r) return false;
    this.environmentReady = null;
    let drawn = false;
    if (!this.featuresUnavailable) {
      try {
        this.featurePainter ??= new GpuFeatures(this.gl);
        this.featurePainter.render(r);
        drawn = true;
      } catch {
        this.featuresUnavailable = true;
      }
    }
    r.ctx.drawImage(this.canvas, 0, 0, r.w, r.h);
    return drawn;
  }
  render(r, entries) {
    const g = this.gl;
    if (this.lost || g.isContextLost()) return false;
    this.frame++;
    this.prepare(r);
    const l = this.locations;
    g.uniformMatrix3fv(
      l.view,
      false,
      new Float32Array([r.r.x, r.u.x, r.f.x, r.r.y, r.u.y, r.f.y, r.r.z, r.u.z, r.f.z]),
    );
    const near = 1,
      far = 200000;
    g.uniform4f(
      l.projection,
      (2 * r.focal) / r.w,
      (2 * r.focal) / r.h,
      (far + near) / (far - near),
      (-2 * far * near) / (far - near),
    );
    g.uniform1i(l.material, 0);
    this.terrainDepth(r);
    const visible = [];
    for (const e of entries) {
      const center = r.local(e.position),
        radius = (e.mesh.radius || Math.max(...e.mesh.points.map((p) => p.length()))) * e.scale;
      if (
        center.z + radius < 1 ||
        Math.abs(center.x) >
          (center.z * r.w) / (2 * r.focal) + radius * Math.hypot(1, r.w / (2 * r.focal)) ||
        Math.abs(center.y) >
          (center.z * r.h * 0.53) / r.focal + radius * Math.hypot(1, (r.h * 0.53) / r.focal)
      )
        continue;
      visible.push([e, this.upload(e.mesh)]);
    }
    g.enable(g.POLYGON_OFFSET_FILL);
    g.polygonOffset(1, 1);
    for (const [e, data] of visible) {
      if (e.material === 'asphalt') g.disable(g.POLYGON_OFFSET_FILL);
      else g.enable(g.POLYGON_OFFSET_FILL);
      this.bind(data);
      this.transform(r, e);
      g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, data.triangles);
      this.color('#101c16');
      const material =
        data.triangleCount && r.surfaceMode && r.surfaceMode !== 'vector'
          ? e.material || 'concrete'
          : null;
      g.uniform1i(l.material, material ? materialIds[material] || 3 : 0);
      if (material) {
        this.surfaceTextures.bind(material);
        g.uniform1i(l.surfaceMap, 0);
        g.uniform1f(l.daylight, surfaceStyle(r.surfaceMode).light);
        g.uniform3fv(l.boundMin, data.mins);
        g.uniform3fv(l.boundSize, data.sizes);
      }
      g.drawElements(g.TRIANGLES, data.triangleCount - data.flapCount, g.UNSIGNED_INT, 0);
      if (data.flapCount) {
        this.color('#40522b');
        g.drawElements(
          g.TRIANGLES,
          data.flapCount,
          g.UNSIGNED_INT,
          (data.triangleCount - data.flapCount) * 4,
        );
      }
    }
    g.disable(g.POLYGON_OFFSET_FILL);
    g.uniform1i(l.material, 0);
    g.depthMask(false);
    for (const [e, data] of visible) {
      const wire = r.surfaceLines !== false || e.material === 'runway';
      if (!wire && !data.detailCount) continue;
      this.bind(data);
      this.transform(r, e);
      this.color(
        e.material === 'runway'
          ? e.color
          : r.surfaceMode && r.surfaceMode !== 'vector'
            ? '#56605c'
            : e.color,
      );
      g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, wire ? data.edges : data.details);
      g.drawElements(g.LINES, wire ? data.edgeCount : data.detailCount, g.UNSIGNED_INT, 0);
    }
    g.depthMask(true);
    r.ctx.drawImage(this.canvas, 0, 0, r.w, r.h);
    if (r.debugMetrics)
      r.modelMetrics = {
        backend: 'WebGL2',
        entries: entries.length,
        visible: visible.length,
        triangles: visible.reduce((sum, [, m]) => sum + m.triangleCount / 3, 0),
        edges: visible.reduce(
          (sum, [, m]) =>
            sum +
            (r.surfaceLines !== false || m.triangleCount === 0 ? m.edgeCount : m.detailCount) / 2,
          0,
        ),
      };
    // Release old swept-wing/flap variants after they have left the scene.
    if (this.frame % 120 === 0)
      for (const resource of this.resources)
        if (this.frame - resource.used > 120) {
          for (const b of resource.buffers) g.deleteBuffer(b);
          this.resources.delete(resource);
          resource.disposed = true;
        }
    return true;
  }
}
