import {SurfaceTextures,surfaceStyle} from './surfaceStyle.js';
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
out vec3 tint;out float depth;out vec3 worldPosition;
void main(){vec3 v=view*(position-camera);depth=v.z;tint=shade;worldPosition=position;gl_Position=vec4(v.x*projection.x,v.y*projection.y-0.06*v.z,projection.z*v.z+projection.w,v.z);}`;
const fragment=`#version 300 es
precision highp float;in vec3 tint;in float depth;in vec3 worldPosition;uniform bool wire;uniform bool textured;uniform sampler2D surfaceMap;uniform vec3 groundColor,rockColor,haze;uniform vec4 climate;uniform float daylight,textureScale,hazeDistance;out vec4 outColor;
void main(){if(textured){if(wire){outColor=vec4(groundColor*0.72,0.16);return;}
 float light=clamp((tint.g-27.0/255.0)/(18.0/255.0),0.0,1.0);vec3 grain=texture(surfaceMap,worldPosition.xz/textureScale).rgb;
 vec3 normal=normalize(cross(dFdx(worldPosition),dFdy(worldPosition)));float slope=1.0-abs(normal.y);
 float rock=smoothstep(0.12,0.58,slope)*climate.x;
 float snow=climate.y*smoothstep(climate.z,climate.z+climate.w,worldPosition.y)*(1.0-smoothstep(0.25,0.68,slope));
 vec3 base=mix(groundColor,rockColor,rock);base=mix(base,vec3(0.89,0.92,0.95),snow);
 vec3 color=base*(0.48+0.52*light)*(0.78+grain*0.42)*daylight;
 float fog=smoothstep(hazeDistance*0.18,hazeDistance,depth)*0.72;
 outColor=vec4(mix(color,haze,fog),1.0);return;}
 if(wire){float alpha=depth<3200.0?0.72:depth<10000.0?0.54:0.32;outColor=vec4(115.0/255.0,163.0/255.0,96.0/255.0,alpha);}else outColor=vec4(tint,1.0);}`;
export class GpuTerrain{
 constructor(gl){this.gl=gl;const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;},vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment),program=this.program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  this.position=gl.getAttribLocation(program,'position');this.shade=gl.getAttribLocation(program,'shade');this.locations={};for(const name of ['view','camera','projection','wire','textured','surfaceMap','groundColor','rockColor','haze','climate','daylight','textureScale','hazeDistance'])this.locations[name]=gl.getUniformLocation(program,name);
  this.surfaceTextures=new SurfaceTextures(gl);this.fills=gl.createBuffer();this.lines=gl.createBuffer();
 }
 render(r){const g=this.gl,l=this.locations;
  if(this.key!==r.terrainSurfaceKey){const data=terrainBuffers(r.terrainSurface);g.bindBuffer(g.ARRAY_BUFFER,this.fills);g.bufferData(g.ARRAY_BUFFER,data.fills,g.STATIC_DRAW);g.bindBuffer(g.ARRAY_BUFFER,this.lines);g.bufferData(g.ARRAY_BUFFER,data.lines,g.STATIC_DRAW);this.fillCount=data.fills.length/6;this.lineCount=data.lines.length/3;this.key=r.terrainSurfaceKey;}
  g.useProgram(this.program);const style=surfaceStyle(r.surfaceMode);g.uniform1i(l.textured,!!r.surfaceMode&&r.surfaceMode!=='vector');g.uniform3fv(l.groundColor,style.terrain);g.uniform3fv(l.rockColor,style.rock);g.uniform3fv(l.haze,[1,3,5].map(i=>parseInt(style.sky[2].slice(i,i+2),16)/255));g.uniform4f(l.climate,style.rockiness,style.snow,style.snowLine,style.snowRange);g.uniform1f(l.daylight,style.light);g.uniform1f(l.textureScale,style.textureScale);g.uniform1f(l.hazeDistance,style.hazeDistance);if(r.surfaceMode&&r.surfaceMode!=='vector'){this.surfaceTextures.bind(style.texture);g.uniform1i(l.surfaceMap,0);}g.uniformMatrix3fv(l.view,false,new Float32Array([r.r.x,r.u.x,r.f.x,r.r.y,r.u.y,r.f.y,r.r.z,r.u.z,r.f.z]));g.uniform3f(l.camera,r.camera.x,r.camera.y,r.camera.z);const near=1,far=200000;g.uniform4f(l.projection,2*r.focal/r.w,2*r.focal/r.h,(far+near)/(far-near),-2*far*near/(far-near));
  g.bindBuffer(g.ARRAY_BUFFER,this.fills);g.enableVertexAttribArray(this.position);g.vertexAttribPointer(this.position,3,g.FLOAT,false,24,0);g.enableVertexAttribArray(this.shade);g.vertexAttribPointer(this.shade,3,g.FLOAT,false,24,12);g.uniform1i(l.wire,0);g.enable(g.POLYGON_OFFSET_FILL);g.polygonOffset(1,1);g.drawArrays(g.TRIANGLES,0,this.fillCount);g.disable(g.POLYGON_OFFSET_FILL);
  if(r.surfaceLines===false)return;
  g.bindBuffer(g.ARRAY_BUFFER,this.lines);g.vertexAttribPointer(this.position,3,g.FLOAT,false,12,0);g.disableVertexAttribArray(this.shade);g.vertexAttrib3f(this.shade,0,0,0);g.uniform1i(l.wire,1);g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);g.depthMask(false);g.lineWidth(1);g.drawArrays(g.LINES,0,this.lineCount);g.depthMask(true);g.disable(g.BLEND);
 }
}
