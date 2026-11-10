import { createShaderProgram } from './shaderProgram.js';
const vertex = `#version 300 es
precision highp float;
in vec3 position; in float opacity; uniform mat3 view; uniform vec4 projection; out float alpha;
void main(){vec3 v=view*position;alpha=opacity;gl_Position=vec4(v.x*projection.x,v.y*projection.y-.06*v.z,projection.z*v.z+projection.w,v.z);}`;
const fragment = `#version 300 es
precision highp float; in float alpha; out vec4 outColor;
void main(){outColor=vec4(0,0,0,alpha);}`;
export class GpuShadows {
  constructor(gl) {
    this.gl = gl;
    this.program = createShaderProgram(gl, vertex, fragment);
    this.buffer = gl.createBuffer();
    this.capacity = 0;
    this.position = gl.getAttribLocation(this.program, 'position');
    this.opacity = gl.getAttribLocation(this.program, 'opacity');
    this.view = gl.getUniformLocation(this.program, 'view');
    this.projection = gl.getUniformLocation(this.program, 'projection');
  }
  render(r, vertices) {
    if (!vertices?.length) return;
    const g = this.gl;
    g.useProgram(this.program);
    g.bindBuffer(g.ARRAY_BUFFER, this.buffer);
    if (vertices.byteLength > this.capacity) {
      this.capacity = 2 ** Math.ceil(Math.log2(vertices.byteLength));
      g.bufferData(g.ARRAY_BUFFER, this.capacity, g.DYNAMIC_DRAW);
    }
    g.bufferSubData(g.ARRAY_BUFFER, 0, vertices);
    g.uniformMatrix3fv(
      this.view,
      false,
      new Float32Array([r.r.x, r.u.x, r.f.x, r.r.y, r.u.y, r.f.y, r.r.z, r.u.z, r.f.z]),
    );
    g.uniform4f(
      this.projection,
      (2 * r.focal) / r.w,
      (2 * r.focal) / r.h,
      200001 / 199999,
      -400000 / 199999,
    );
    g.enableVertexAttribArray(this.position);
    g.vertexAttribPointer(this.position, 3, g.FLOAT, false, 16, 0);
    g.enableVertexAttribArray(this.opacity);
    g.vertexAttribPointer(this.opacity, 1, g.FLOAT, false, 16, 12);
    g.enable(g.BLEND);
    g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
    g.enable(g.POLYGON_OFFSET_FILL);
    g.polygonOffset(-12, -12);
    g.depthMask(false);
    g.drawArrays(g.TRIANGLES, 0, vertices.length / 4);
    g.depthMask(true);
    g.disable(g.BLEND);
    g.disable(g.POLYGON_OFFSET_FILL);
  }
}
