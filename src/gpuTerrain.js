// Static terrain buffers share the model renderer's WebGL context.
// Fill and wire passes use one depth buffer, so slopes remain opaque.
export function terrainBuffers(faces){
 const fills=new Float32Array(faces.length*18),edges=[],ids=new Map();let offset=0;
 for(const face of faces){const color=face.color.match(/[\d.]+/g).map(Number).map(v=>v/255);
  for(const p of face.points)for(const value of [p.x,p.y,p.z,...color])fills[offset++]=value;
  for(let i=0;i<3;i++){const a=face.points[i],b=face.points[(i+1)%3];let ai=ids.get(a),bi=ids.get(b);if(ai===undefined){ai=ids.size;ids.set(a,ai);}if(bi===undefined){bi=ids.size;ids.set(b,bi);}edges.push({a,b,key:ai<bi?ai+':'+bi:bi+':'+ai});}
 }
 const seen=new Set(),lines=[];for(const {a,b,key}of edges)if(!seen.has(key)){seen.add(key);lines.push(a.x,a.y,a.z,b.x,b.y,b.z);}
 return {fills,lines:new Float32Array(lines)};
}
const vertex=`#version 300 es
precision highp float;
in vec3 position,shade;uniform mat3 view;uniform vec3 camera;uniform vec4 projection;
out vec3 tint;out float depth;
void main(){vec3 v=view*(position-camera);depth=v.z;tint=shade;gl_Position=vec4(v.x*projection.x,v.y*projection.y-0.06*v.z,projection.z*v.z+projection.w,v.z);}`;
const fragment=`#version 300 es
precision highp float;in vec3 tint;in float depth;uniform bool wire;out vec4 outColor;
void main(){if(wire){float alpha=depth<3200.0?0.72:depth<10000.0?0.54:0.32;outColor=vec4(115.0/255.0,163.0/255.0,96.0/255.0,alpha);}else outColor=vec4(tint,1.0);}`;
export class GpuTerrain{
 constructor(gl){this.gl=gl;const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;},vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment),program=this.program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  this.position=gl.getAttribLocation(program,'position');this.shade=gl.getAttribLocation(program,'shade');this.locations={};for(const name of ['view','camera','projection','wire'])this.locations[name]=gl.getUniformLocation(program,name);
  this.fills=gl.createBuffer();this.lines=gl.createBuffer();
 }
 render(r){const g=this.gl,l=this.locations;
  if(this.key!==r.terrainSurfaceKey){const data=terrainBuffers(r.terrainSurface);g.bindBuffer(g.ARRAY_BUFFER,this.fills);g.bufferData(g.ARRAY_BUFFER,data.fills,g.STATIC_DRAW);g.bindBuffer(g.ARRAY_BUFFER,this.lines);g.bufferData(g.ARRAY_BUFFER,data.lines,g.STATIC_DRAW);this.fillCount=data.fills.length/6;this.lineCount=data.lines.length/3;this.key=r.terrainSurfaceKey;}
  g.useProgram(this.program);g.uniformMatrix3fv(l.view,false,new Float32Array([r.r.x,r.u.x,r.f.x,r.r.y,r.u.y,r.f.y,r.r.z,r.u.z,r.f.z]));g.uniform3f(l.camera,r.camera.x,r.camera.y,r.camera.z);const near=1,far=200000;g.uniform4f(l.projection,2*r.focal/r.w,2*r.focal/r.h,(far+near)/(far-near),-2*far*near/(far-near));
  g.bindBuffer(g.ARRAY_BUFFER,this.fills);g.enableVertexAttribArray(this.position);g.vertexAttribPointer(this.position,3,g.FLOAT,false,24,0);g.enableVertexAttribArray(this.shade);g.vertexAttribPointer(this.shade,3,g.FLOAT,false,24,12);g.uniform1i(l.wire,0);g.enable(g.POLYGON_OFFSET_FILL);g.polygonOffset(1,1);g.drawArrays(g.TRIANGLES,0,this.fillCount);g.disable(g.POLYGON_OFFSET_FILL);
  g.bindBuffer(g.ARRAY_BUFFER,this.lines);g.vertexAttribPointer(this.position,3,g.FLOAT,false,12,0);g.disableVertexAttribArray(this.shade);g.vertexAttrib3f(this.shade,0,0,0);g.uniform1i(l.wire,1);g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);g.depthMask(false);g.lineWidth(1);g.drawArrays(g.LINES,0,this.lineCount);g.depthMask(true);g.disable(g.BLEND);
 }
}
