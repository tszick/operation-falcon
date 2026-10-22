import { createShaderProgram } from './shaderProgram.js';
import { surfaceStyle } from '../../surfaceStyle.js';
import { cachedFeatureVisible } from '../../terrainFeatures.js';
import { featureWindow, buildFeatureBuffers, featurePatchInView } from '../shared/featureData.js';
export { featureWindow, buildFeatureBuffers, featurePatchInView } from '../shared/featureData.js';
const vertex = `#version 300 es
precision highp float;in vec3 position,color;in float kind,detail,patchId;uniform sampler2D visibility;uniform mat3 view;uniform vec3 camera;uniform vec4 projection;out vec3 tint;out float depth;flat out int featureKind,featureDetail;
void main(){if(texelFetch(visibility,ivec2(int(patchId),0),0).r<0.5){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}vec3 v=view*(position-camera);depth=v.z;tint=color;featureKind=int(kind);featureDetail=int(detail);gl_Position=vec4(v.x*projection.x,v.y*projection.y-0.06*v.z,projection.z*v.z+projection.w,v.z);}`;
const fragment = `#version 300 es
precision highp float;in vec3 tint;in float depth;flat in int featureKind,featureDetail;uniform float daylight;out vec4 outColor;
void main(){if(featureDetail==1&&depth>=4000.0||featureDetail==2&&depth>=2200.0)discard;float alpha=featureKind==0?clamp((36000.0-depth)/12000.0,0.0,1.0):clamp((10500.0-depth)/3500.0,0.0,1.0);outColor=vec4(tint*daylight,alpha);}`;
export class GpuFeatures {
  constructor(g) {
    this.gl = g;
    const p = (this.program = createShaderProgram(g, vertex, fragment));
    this.locations = {};
    for (const name of ['view', 'camera', 'projection', 'visibility', 'daylight'])
      this.locations[name] = g.getUniformLocation(p, name);
    this.attributes = {};
    for (const name of ['position', 'color', 'kind', 'detail', 'patchId'])
      this.attributes[name] = g.getAttribLocation(p, name);
    this.buffer = g.createBuffer();
    this.visibility = g.createTexture();
    this.uploads = 0;
  }
  render(r) {
    const g = this.gl,
      l = this.locations,
      window = featureWindow(r.camera, this.window);
    this.window = window;
    if (this.key !== window.key) {
      const data = buildFeatureBuffers(r.camera, window);
      g.bindBuffer(g.ARRAY_BUFFER, this.buffer);
      g.bufferData(g.ARRAY_BUFFER, data.vertices, g.STATIC_DRAW);
      this.count = data.vertices.length / 9;
      this.patches = data.patches;
      this.mask = new Uint8Array(Math.max(1, data.patches.length));
      this.key = data.key;
      this.uploads++;
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, this.visibility);
      g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
      g.texImage2D(
        g.TEXTURE_2D,
        0,
        g.R8,
        this.mask.length,
        1,
        0,
        g.RED,
        g.UNSIGNED_BYTE,
        this.mask,
      );
      g.pixelStorei(g.UNPACK_ALIGNMENT, 4);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
    }
    for (const [i, patch] of this.patches.entries())
      this.mask[i] =
        featurePatchInView(r, patch) && cachedFeatureVisible(r.camera, patch.center) ? 255 : 0;
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, this.visibility);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, this.mask.length, 1, g.RED, g.UNSIGNED_BYTE, this.mask);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 4);
    g.useProgram(this.program);
    g.uniform1f(l.daylight, surfaceStyle(r.surfaceMode).light);
    g.uniform1i(l.visibility, 0);
    g.uniformMatrix3fv(
      l.view,
      false,
      new Float32Array([r.r.x, r.u.x, r.f.x, r.r.y, r.u.y, r.f.y, r.r.z, r.u.z, r.f.z]),
    );
    g.uniform3f(l.camera, r.camera.x, r.camera.y, r.camera.z);
    const near = 1,
      far = 200000;
    g.uniform4f(
      l.projection,
      (2 * r.focal) / r.w,
      (2 * r.focal) / r.h,
      (far + near) / (far - near),
      (-2 * far * near) / (far - near),
    );
    g.bindBuffer(g.ARRAY_BUFFER, this.buffer);
    for (const [name, size, offset] of [
      ['position', 3, 0],
      ['color', 3, 12],
      ['kind', 1, 24],
      ['detail', 1, 28],
      ['patchId', 1, 32],
    ]) {
      const a = this.attributes[name];
      g.enableVertexAttribArray(a);
      g.vertexAttribPointer(a, size, g.FLOAT, false, 36, offset);
    }
    // Coarse terrain triangles do not represent narrow river beds. Use the same
    // procedural visibility as Canvas, so the water cannot vanish below that mesh.
    g.disable(g.DEPTH_TEST);
    g.depthMask(false);
    g.enable(g.BLEND);
    g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
    g.drawArrays(g.TRIANGLES, 0, this.count);
    g.depthMask(true);
    g.disable(g.BLEND);
    if (r.debugMetrics)
      r.featureMetrics = { backend: 'WebGL2', triangles: this.count / 3, uploads: this.uploads };
  }
}
