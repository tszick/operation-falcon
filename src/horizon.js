// Decorative distant scenery: fixed world bearings, no collision or radar targets.
export const horizonRange=120000;
export const horizonBottom=-.12,horizonTop=.22;
export function panoramaCoordinates(direction,altitude=0){
 const bearing=Math.atan2(direction.x,direction.z),turn=(bearing/(Math.PI*2)+1)%1;
 // Mirroring the strip at the antipode gives a continuous wrap even at its seam.
 const u=1-Math.abs(2*turn-1),elevation=Math.atan2(direction.y,Math.hypot(direction.x,direction.z));
 return {u,v:(elevation+Math.atan2(Math.max(0,altitude),horizonRange)-horizonBottom)/(horizonTop-horizonBottom)};
}
let panorama;
export function horizonImage(){if(!panorama&&typeof Image!=='undefined'){panorama=new Image();panorama.src='/assets/environment/horizon-mountains.png';}return panorama?.complete&&panorama.naturalWidth?panorama:null;}
const vertex=`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
const fragment=`#version 300 es
precision highp float;uniform sampler2D panorama;uniform mat3 basis;uniform vec3 screen;uniform float depression;uniform vec2 elevationRange;out vec4 outColor;
void main(){vec3 ray=basis*vec3((gl_FragCoord.x-screen.x*0.5)/screen.z,(gl_FragCoord.y-screen.y*0.47)/screen.z,1.0);
 float turn=fract(atan(ray.x,ray.z)/6.28318530718+1.0),u=1.0-abs(2.0*turn-1.0),v=(atan(ray.y,length(ray.xz))+depression-elevationRange.x)/elevationRange.y;
 if(v>1.0)discard;vec4 mountain=texture(panorama,vec2(u,clamp(v,0.001,0.999)));
 vec3 tone=mix(mountain.rgb,vec3(0.10,0.145,0.13),0.24);tone=mix(vec3(0.055,0.118,0.086),tone,smoothstep(-0.08,0.2,v));
 // Premultiplied output composites the transparent skyline cleanly over the stars.
 outColor=vec4(tone*mountain.a,mountain.a);
}`;
export class GpuHorizon{
 constructor(g,image){this.gl=g;const compile=(type,source)=>{const shader=g.createShader(type);g.shaderSource(shader,source);g.compileShader(shader);if(!g.getShaderParameter(shader,g.COMPILE_STATUS))throw new Error(g.getShaderInfoLog(shader));return shader;},vs=compile(g.VERTEX_SHADER,vertex),fs=compile(g.FRAGMENT_SHADER,fragment),p=this.program=g.createProgram();g.attachShader(p,vs);g.attachShader(p,fs);g.linkProgram(p);g.deleteShader(vs);g.deleteShader(fs);if(!g.getProgramParameter(p,g.LINK_STATUS))throw new Error(g.getProgramInfoLog(p));
  this.locations={};for(const name of ['panorama','basis','screen','depression','elevationRange'])this.locations[name]=g.getUniformLocation(p,name);
  this.texture=g.createTexture();g.bindTexture(g.TEXTURE_2D,this.texture);g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,true);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,image);g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,false);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
 }
 render(r){const g=this.gl,l=this.locations;g.useProgram(this.program);g.disable(g.DEPTH_TEST);g.disable(g.BLEND);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.texture);g.uniform1i(l.panorama,0);g.uniform3f(l.screen,r.w,r.h,r.focal);g.uniform2f(l.elevationRange,horizonBottom,horizonTop-horizonBottom);g.uniform1f(l.depression,Math.atan2(Math.max(0,r.camera.y),horizonRange));g.uniformMatrix3fv(l.basis,false,new Float32Array([r.r.x,r.r.y,r.r.z,r.u.x,r.u.y,r.u.z,r.f.x,r.f.y,r.f.z]));g.drawArrays(g.TRIANGLES,0,3);}
}
