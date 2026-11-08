import { buildFarmland, farmlandExtent, farmlandSize, farmlandPalette } from '../../farmland.js';
import { terrainWorld } from '../../terrain.js';
import { SurfaceTextures } from './textures.js';
import { createShaderProgram } from './shaderProgram.js';
import { surfaceStyle } from '../../surfaceStyle.js';
// Static terrain buffers share the model renderer's WebGL context.
// Fill and wire passes use one depth buffer, so slopes remain opaque.
import { terrainBuffers } from '../shared/terrainData.js';
export { terrainBuffers } from '../shared/terrainData.js';
const vertex = `#version 300 es
precision highp float;
in vec3 position,shade;uniform mat3 view;uniform vec3 camera;uniform vec4 projection;uniform bool ocean;
out vec3 tint;out float depth;out vec3 worldPosition;out float canopyKind;out float canopyElevation;
void main(){vec3 point=position;canopyKind=shade.r>0.5&&!ocean?shade.r:0.0;canopyElevation=0.0;
 if(canopyKind>0.0){float lod=(1.0-smoothstep(2200.0,6000.0,length(position.xz-camera.xz)))*(1.0-smoothstep(1500.0,3200.0,max(0.0,camera.y-position.y)));canopyElevation=shade.b*64.0*lod;point.y-=shade.b*64.0-canopyElevation;}if(ocean)point.y=max(0.03,point.y);vec3 v=view*(point-camera);depth=v.z;tint=shade;worldPosition=ocean?position:point;gl_Position=vec4(v.x*projection.x,v.y*projection.y-0.06*v.z,projection.z*v.z+projection.w,v.z);}`;
const fragment = `#version 300 es
precision highp float;in vec3 tint;in float depth;in vec3 worldPosition;in float canopyKind;in float canopyElevation;uniform bool depthOnly;uniform bool wire;uniform bool textured;uniform bool ocean;uniform sampler2D surfaceMap;uniform vec3 groundColor,rockColor,haze;uniform sampler2D farmlandMap;uniform vec3 cropColors[5];uniform float farmlandExtent;uniform vec4 climate;uniform float daylight,textureScale,hazeDistance;out vec4 outColor;
void main(){if(canopyKind>0.0&&canopyElevation<0.75)discard;if(depthOnly){outColor=vec4(0.0);return;}if(ocean){
 if(abs(worldPosition.y)<0.0001)discard;
 float d=max(0.0,-worldPosition.y),alpha=1.0-smoothstep(260.0,650.0,d);
 vec3 n=normalize(cross(dFdx(worldPosition),dFdy(worldPosition)));
 float light=0.58+0.42*abs(dot(n,normalize(vec3(-0.36,0.86,-0.36))));
 vec3 color=mix(vec3(0.075,0.61,0.65),vec3(0.10,0.30,0.42),smoothstep(0.0,650.0,d));
 if(worldPosition.y>0.0)color=tint*(0.7+texture(surfaceMap,worldPosition.xz/textureScale).rgb*0.55);
 float foam=exp(-pow(d/22.0,2.0))*(worldPosition.y<0.0?0.22:0.0);
 color=mix(color,vec3(0.78,0.91,0.85),foam);
 color=mix(color,haze,smoothstep(7000.0,40000.0,depth)*0.45);
 outColor=vec4(color,alpha);return;
 }if(textured){if(wire){outColor=vec4(groundColor*0.72,0.16);return;}
 float light=canopyKind>0.0?tint.g:clamp((tint.g-27.0/255.0)/(18.0/255.0),0.0,1.0);vec3 grain=texture(surfaceMap,worldPosition.xz/textureScale).rgb;
 vec3 normal=normalize(cross(dFdx(worldPosition),dFdy(worldPosition)));float slope=1.0-abs(normal.y);
 float rock=smoothstep(0.12,0.58,slope)*climate.x;
 float snow=climate.y*smoothstep(climate.z,climate.z+climate.w,worldPosition.y)*(1.0-smoothstep(0.25,0.68,slope));
 vec3 base=mix(groundColor,rockColor,rock);base=mix(base,vec3(0.89,0.92,0.95),snow);
 vec2 landUV=worldPosition.xz/farmlandExtent+0.5;
 vec4 field=texture(farmlandMap,clamp(landUV,vec2(0.0),vec2(1.0)));
 ivec2 atlasSize=textureSize(farmlandMap,0);
 vec3 fieldData=texelFetch(farmlandMap,clamp(ivec2(landUV*vec2(atlasSize)),ivec2(0),atlasSize-1),0).rgb;
 float forestMaterial=1.0-step(0.15,fieldData.g+fieldData.b);
 float cropValue=fieldData.r*255.0/223.0;
 float edge=max(fwidth(field.a),0.002);
 float cultivated=smoothstep(0.5-edge,0.5+edge,field.a)*(1.0-smoothstep(0.06,0.19,slope));
 cultivated*=step(0.0,landUV.x)*step(landUV.x,1.0)*step(0.0,landUV.y)*step(landUV.y,1.0);
 if(climate.z>0.0)cultivated*=1.0-snow;
 cultivated*=1.0-forestMaterial;
 vec3 crop=cropValue<0.27?cropColors[0]:cropValue<0.51?cropColors[1]:cropValue<0.74?cropColors[2]:cropValue<0.96?cropColors[3]:cropColors[4];
 vec2 direction=normalize(fieldData.gb*2.0-1.0+vec2(0.0001));
 float row=dot(worldPosition.xz,direction)/8.0;
 float detail=1.0-smoothstep(0.2,0.7,fwidth(row));
 float furrow=sin(row*6.2831853)*0.09*detail;
 base=mix(base,crop*(1.0+furrow),cultivated*0.86);
 float treeType=canopyKind>0.0?step(0.7,canopyKind):step(0.96,fieldData.r);
 vec3 leaf=mix(vec3(0.11,0.25,0.065),vec3(0.065,0.18,0.11),treeType);
 float crown=sin(worldPosition.x*0.17+sin(worldPosition.z*0.11))*sin(worldPosition.z*0.15+sin(worldPosition.x*0.13))*0.14;
 crown*=1.0-smoothstep(0.3,1.2,max(fwidth(worldPosition.x),fwidth(worldPosition.z))*0.1);
 leaf*=0.94+crown;
 if(groundColor.r>0.6&&climate.z>0.0)leaf=mix(leaf,vec3(0.31,0.30,0.13),0.7);
 float winter=climate.y*(1.0-step(0.0,climate.z));
 leaf=mix(leaf,vec3(0.73,0.79,0.76),winter*clamp(abs(normal.y)*0.58+0.15+crown,0.0,1.0));
 float forestWeight=forestMaterial*smoothstep(0.5-edge,0.5+edge,field.a)*(1.0-smoothstep(0.20,0.55,slope))*(1.0-smoothstep(1500.0,2100.0,worldPosition.y));
 if(canopyKind>0.0)forestWeight=1.0;
 base=mix(base,leaf,forestWeight);
 vec3 color=base*(0.48+0.52*light)*(0.78+grain*0.42)*daylight;
 float fog=smoothstep(hazeDistance*0.18,hazeDistance,depth)*0.72;
 outColor=vec4(mix(color,haze,fog),1.0);return;}
 if(wire){float alpha=depth<3200.0?0.72:depth<10000.0?0.54:0.32;outColor=vec4(115.0/255.0,163.0/255.0,96.0/255.0,alpha);}else outColor=vec4(tint,1.0);}`;
export class GpuTerrain {
  constructor(gl) {
    this.gl = gl;
    const program = (this.program = createShaderProgram(gl, vertex, fragment));
    this.position = gl.getAttribLocation(program, 'position');
    this.shade = gl.getAttribLocation(program, 'shade');
    this.locations = {};
    for (const name of [
      'view',
      'camera',
      'projection',
      'wire',
      'depthOnly',
      'textured',
      'ocean',
      'surfaceMap',
      'farmlandMap',
      'farmlandExtent',
      'cropColors[0]',
      'groundColor',
      'rockColor',
      'haze',
      'climate',
      'daylight',
      'textureScale',
      'hazeDistance',
    ])
      this.locations[name] = gl.getUniformLocation(program, name);
    this.surfaceTextures = new SurfaceTextures(gl);
    this.farmlandTexture = gl.createTexture();
    this.fills = gl.createBuffer();
    this.lines = gl.createBuffer();
  }
  render(r, { depthOnly = false } = {}) {
    const g = this.gl,
      l = this.locations;
    if (this.key !== r.terrainSurfaceKey) {
      const data =
        r.terrainBuffers || terrainBuffers(r.terrainSurface, { wire: r.surfaceLines !== false });
      g.bindBuffer(g.ARRAY_BUFFER, this.fills);
      g.bufferData(g.ARRAY_BUFFER, data.fills, g.STATIC_DRAW);
      g.bindBuffer(g.ARRAY_BUFFER, this.lines);
      g.bufferData(g.ARRAY_BUFFER, data.lines, g.STATIC_DRAW);
      this.fillCount = data.fills.length / 6;
      this.lineCount = data.lines.length / 3;
      this.key = r.terrainSurfaceKey;
    }
    g.useProgram(this.program);
    g.uniform1i(l.depthOnly, depthOnly);
    const style = surfaceStyle(r.surfaceMode);
    // Upload the land-use map only when a new terrain world is created.
    g.activeTexture(g.TEXTURE1);
    g.bindTexture(g.TEXTURE_2D, this.farmlandTexture);
    if (this.farmlandWorld !== terrainWorld) {
      const pixels =
        r.terrainFarmlandRevision === terrainWorld.revision && r.terrainFarmland
          ? r.terrainFarmland
          : buildFarmland().pixels;
      g.texImage2D(
        g.TEXTURE_2D,
        0,
        g.RGBA,
        farmlandSize,
        farmlandSize,
        0,
        g.RGBA,
        g.UNSIGNED_BYTE,
        pixels,
      );
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      this.farmlandWorld = terrainWorld;
      r.terrainFarmland = null;
    }
    g.uniform1i(l.farmlandMap, 1);
    g.uniform1f(l.farmlandExtent, farmlandExtent);
    g.uniform3fv(l['cropColors[0]'], farmlandPalette(r.surfaceMode).flat());
    g.uniform1i(l.ocean, r.surfaceMode === 'ocean');
    g.uniform1i(l.textured, !!r.surfaceMode && r.surfaceMode !== 'vector');
    g.uniform3fv(l.groundColor, style.terrain);
    g.uniform3fv(l.rockColor, style.rock);
    g.uniform3fv(
      l.haze,
      [1, 3, 5].map((i) => parseInt(style.sky[2].slice(i, i + 2), 16) / 255),
    );
    g.uniform4f(l.climate, style.rockiness, style.snow, style.snowLine, style.snowRange);
    g.uniform1f(l.daylight, style.light);
    g.uniform1f(l.textureScale, style.textureScale);
    g.uniform1f(l.hazeDistance, style.hazeDistance);
    if (r.surfaceMode && r.surfaceMode !== 'vector') {
      this.surfaceTextures.bind(r.surfaceMode === 'ocean' ? 'terrain-sand' : style.texture);
      g.uniform1i(l.surfaceMap, 0);
    }
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
    g.bindBuffer(g.ARRAY_BUFFER, this.fills);
    g.enableVertexAttribArray(this.position);
    g.vertexAttribPointer(this.position, 3, g.FLOAT, false, 24, 0);
    g.enableVertexAttribArray(this.shade);
    g.vertexAttribPointer(this.shade, 3, g.FLOAT, false, 24, 12);
    g.uniform1i(l.wire, 0);
    g.enable(g.POLYGON_OFFSET_FILL);
    g.polygonOffset(1, 1);
    if (r.surfaceMode === 'ocean') {
      g.enable(g.BLEND);
      g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
    }
    g.drawArrays(g.TRIANGLES, 0, this.fillCount);
    if (r.surfaceMode === 'ocean') g.disable(g.BLEND);
    g.disable(g.POLYGON_OFFSET_FILL);
    if (depthOnly || r.surfaceLines === false) return;
    g.bindBuffer(g.ARRAY_BUFFER, this.lines);
    g.vertexAttribPointer(this.position, 3, g.FLOAT, false, 12, 0);
    g.disableVertexAttribArray(this.shade);
    g.vertexAttrib3f(this.shade, 0, 0, 0);
    g.uniform1i(l.wire, 1);
    g.enable(g.BLEND);
    g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
    g.depthMask(false);
    g.lineWidth(1);
    g.drawArrays(g.LINES, 0, this.lineCount);
    g.depthMask(true);
    g.disable(g.BLEND);
  }
}
