import { createShaderProgram } from './shaderProgram.js';
import { surfaceStyle } from '../../surfaceStyle.js';
// Decorative distant scenery: fixed world bearings, no collision or radar targets.
export const horizonRange = 120000;
export const horizonBottom = -0.12,
  horizonTop = 0.22;
export function panoramaCoordinates(direction, altitude = 0) {
  const bearing = Math.atan2(direction.x, direction.z),
    turn = (bearing / (Math.PI * 2) + 1) % 1;
  // Mirroring the strip at the antipode gives a continuous wrap even at its seam.
  const u = 1 - Math.abs(2 * turn - 1),
    elevation = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
  return {
    u,
    v:
      (elevation + Math.atan2(Math.max(0, altitude), horizonRange) - horizonBottom) /
      (horizonTop - horizonBottom),
  };
}
let panorama;
export function horizonImage() {
  if (!panorama && typeof Image !== 'undefined') {
    panorama = new Image();
    panorama.src = '/assets/environment/horizon-mountains.png';
  }
  return panorama?.complete && panorama.naturalWidth ? panorama : null;
}
const vertex = `#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
const fragment = `#version 300 es
precision highp float;uniform sampler2D panorama;uniform bool textured;uniform bool ocean;uniform vec3 haze;uniform float daylight;uniform mat3 basis;uniform vec3 screen;uniform float depression;uniform vec2 elevationRange;out vec4 outColor;
void main(){vec3 ray=basis*vec3((gl_FragCoord.x-screen.x*0.5)/screen.z,(gl_FragCoord.y-screen.y*0.47)/screen.z,1.0);
 float turn=fract(atan(ray.x,ray.z)/6.28318530718+1.0),u=1.0-abs(2.0*turn-1.0),v=(atan(ray.y,length(ray.xz))+depression-elevationRange.x)/elevationRange.y;
 if(ocean){
  // World-space horizon follows pitch and bank; periodic detail has no wrap seam.
  float e=atan(ray.y,length(ray.xz))+depression;
  if(e>0.14)discard;
  float band=exp(-pow(e/0.026,2.0));
  vec3 sea=mix(vec3(0.10,0.30,0.42),vec3(0.32,0.49,0.59),smoothstep(-0.16,0.0,e));
  sea+=vec3(0.006,0.009,0.011)*sin(e*1800.0+sin(turn*25.132741)*0.4)*smoothstep(-0.11,-0.025,e)*(1.0-smoothstep(-0.025,0.0,e));
  vec3 tone=mix(sea,vec3(0.48,0.65,0.73),band*0.55);
  float alpha=e<=0.0?1.0:1.0-smoothstep(0.0,0.14,e);
  // A distant 240-degree coast: low dunes and small towers fade into the open sea.
  float bearing=atan(ray.x,ray.z),shoreAngle=atan(sin(bearing-3.14159265359),cos(bearing-3.14159265359));
  float coast=1.0-smoothstep(1.45,2.0943951,abs(shoreAngle));
  float dunes=0.004+0.002*sin(bearing*11.0)+0.001*sin(bearing*23.0);
  float city=1.0-smoothstep(0.85,1.90,abs(shoreAngle));
  float block=floor((shoreAngle+0.5)*180.0),seed=fract(sin(block*127.1)*43758.5453);
  float tower=city*(0.004+0.015*seed*seed);
  float roof=coast*(dunes+tower),edge=max(fwidth(e),0.00006);
  float land=coast*(1.0-smoothstep(roof-edge,roof+edge,e))*smoothstep(-0.004,0.001,e);
  vec3 sand=mix(vec3(0.53,0.56,0.50),vec3(0.65,0.64,0.52),smoothstep(0.001,0.006,e));
  if(e>coast*dunes)sand=vec3(0.30,0.41,0.47);
  tone=mix(tone,sand,land*0.93);alpha=max(alpha,land);
  outColor=vec4(tone*alpha,alpha);return;
 }
 if(v>1.0)discard;vec4 mountain=texture(panorama,vec2(u,clamp(v,0.001,0.999)));
 vec3 tone=mix(mountain.rgb,vec3(0.10,0.145,0.13),0.24);tone=mix(vec3(0.055,0.118,0.086),tone,smoothstep(-0.08,0.2,v));
 if(textured){tone=mix(mountain.rgb*0.85*daylight,haze,0.45);tone=mix(haze*0.6,tone,smoothstep(-0.08,0.2,v));}
 // Premultiplied output composites the transparent skyline cleanly over the stars.
 outColor=vec4(tone*mountain.a,mountain.a);
}`;
export class GpuHorizon {
  constructor(g, image) {
    this.gl = g;
    const p = (this.program = createShaderProgram(g, vertex, fragment));
    this.locations = {};
    for (const name of [
      'ocean',
      'textured',
      'haze',
      'daylight',
      'panorama',
      'basis',
      'screen',
      'depression',
      'elevationRange',
    ])
      this.locations[name] = g.getUniformLocation(p, name);
    this.texture = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, this.texture);
    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, image);
    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  }
  render(r) {
    const g = this.gl,
      l = this.locations;
    g.useProgram(this.program);
    const style = surfaceStyle(r.surfaceMode);
    g.uniform1i(l.ocean, r.surfaceMode === 'ocean');
    g.uniform1i(l.textured, !!r.surfaceMode && r.surfaceMode !== 'vector');
    g.uniform1f(l.daylight, style.light);
    g.uniform3fv(
      l.haze,
      [1, 3, 5].map((i) => parseInt(style.sky[1].slice(i, i + 2), 16) / 255),
    );
    g.disable(g.DEPTH_TEST);
    g.disable(g.BLEND);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, this.texture);
    g.uniform1i(l.panorama, 0);
    g.uniform3f(l.screen, r.w, r.h, r.focal);
    g.uniform2f(l.elevationRange, horizonBottom, horizonTop - horizonBottom);
    g.uniform1f(l.depression, Math.atan2(Math.max(0, r.camera.y), horizonRange));
    g.uniformMatrix3fv(
      l.basis,
      false,
      new Float32Array([r.r.x, r.r.y, r.r.z, r.u.x, r.u.y, r.u.z, r.f.x, r.f.y, r.f.z]),
    );
    g.drawArrays(g.TRIANGLES, 0, 3);
  }
}
