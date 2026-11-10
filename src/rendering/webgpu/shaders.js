export const uniforms = `
struct Uniforms {
 view:mat3x3f, rotation:mat3x3f, translation:vec4f, projection:vec4f,
 integrity:vec4f, color:vec4f, boundMin:vec4f, boundSize:vec4f,
 style:vec4f, climate:vec4f, ground:vec4f, rock:vec4f, haze:vec4f, screen:vec4f
};
@group(0) @binding(0) var<uniform> u:Uniforms;
@group(0) @binding(1) var surfaceMap:texture_2d<f32>;
@group(0) @binding(2) var surfaceSampler:sampler;
fn project(p:vec3f)->vec4f {let v=u.view*p;return vec4f(v.x*u.projection.x,v.y*u.projection.y-0.06*v.z,u.projection.z*v.z+u.projection.w,v.z);}
`;
export const models =
  uniforms +
  `
struct Out {@builtin(position) position:vec4f,@location(0) health:f32,@location(1) local:vec3f,@location(2) world:vec3f};
@vertex fn vs(@location(0) position:vec3f,@location(1) wing:vec2f)->Out {
 var o:Out;var p=position;var health=1.0;
 if(wing.x>0.5){health=u.integrity.x;}else if(wing.y>0.5){health=u.integrity.y;}
 if(health<0.8){let outer=max(0.0,abs(p.x)-1.2);p.x=sign(p.x)*(min(1.2,abs(p.x))+outer*(0.15+0.85*health));p.y-=outer*(1.0-health)*0.3;}
 o.health=health;o.local=p;o.world=u.rotation*(p*u.integrity.z);o.position=project(o.world+u.translation.xyz);return o;
}
@fragment fn fs(o:Out)->@location(0) vec4f {
 let n=normalize(cross(dpdx(o.local),dpdy(o.local)));let a=abs(n);
 let light=0.52+0.48*abs(dot(normalize(cross(dpdx(o.world),dpdy(o.world))),normalize(vec3f(-0.36,0.86,-0.36))));
 if(o.health<0.09){discard;}let material=u32(u.integrity.w);if(material==0u){return u.color;}
 var uv=o.local.xy;if(a.y>a.x&&a.y>a.z){uv=o.local.xz;}else if(a.x>a.z){uv=o.local.zy;}
 if(material==4u){let p=(o.local-u.boundMin.xyz)/u.boundSize.xyz;if(a.y>a.x&&a.y>a.z){uv=vec2f(0.03,p.z);}else if(a.x>a.z){uv=vec2f(p.z,1-p.y);}else{uv=vec2f(p.x,1-p.y);}}
 else{uv*=select(select(0.08,0.15,material==2u),0.12,material==1u);}
 return vec4f(textureSample(surfaceMap,surfaceSampler,uv).rgb*light*u.style.x,1);
}
`;
export const terrain =
  uniforms +
  `
struct Farmland {colors:array<vec4f,5>, bounds:vec4f};
@group(0) @binding(3) var farmlandMap:texture_2d<f32>;
@group(0) @binding(4) var farmlandSampler:sampler;
@group(0) @binding(5) var<uniform> farmland:Farmland;
struct Out {@builtin(position) position:vec4f,@location(0) tint:vec3f,@location(1) depth:f32,@location(2) world:vec3f,@location(3) canopyKind:f32,@location(4) canopyElevation:f32};
@vertex fn vs(@location(0) position:vec3f,@location(1) shade:vec3f)->Out {
 var o:Out;var point=position;o.canopyKind=select(0.0,shade.r,shade.r>0.5&&u.ground.w<0.5);o.canopyElevation=0.0;
 if(o.canopyKind>0.0){let lod=(1-smoothstep(2200.0,6000.0,length(position.xz-u.translation.xz)))*(1-smoothstep(1500.0,3200.0,max(0.0,u.translation.y-position.y)));o.canopyElevation=shade.b*64*lod;point.y-=shade.b*64-o.canopyElevation;}
 if(u.ground.w>0.5){point.y=max(0.03,point.y);}let relative=point-u.translation.xyz;o.position=project(relative);o.tint=shade;o.depth=(u.view*relative).z;o.world=select(point,position,u.ground.w>0.5);return o;
}
@fragment fn fs(o:Out)->@location(0) vec4f {
 if(o.canopyKind>0.0&&o.canopyElevation<0.75){discard;}
 if(u.style.z< -0.5){return vec4f(0);}
 let grain=textureSample(surfaceMap,surfaceSampler,o.world.xz/u.style.w).rgb;
 if(u.ground.w>0.5){
  if(abs(o.world.y)<0.0001){discard;}
  let depth=max(0.0,-o.world.y);let alpha=1-smoothstep(260.0,650.0,depth);
  let normal=normalize(cross(dpdx(o.world),dpdy(o.world)));
  let light=0.58+0.42*abs(dot(normal,normalize(vec3f(-0.36,0.86,-0.36))));
  var color=mix(vec3f(0.075,0.61,0.65),vec3f(0.10,0.30,0.42),smoothstep(0.0,650.0,depth));
  if(o.world.y>0.0){color=o.tint*(0.7+grain*0.55);}
  let foam=exp(-pow(depth/22.0,2))*select(0.0,0.22,o.world.y<0.0);
  color=mix(color,vec3f(0.78,0.91,0.85),foam);
  color=mix(color,u.haze.rgb,smoothstep(7000.0,40000.0,o.depth)*0.45);
  return vec4f(color*alpha,alpha);
 }
 let normal=normalize(cross(dpdx(o.world),dpdy(o.world)));let slope=1-abs(normal.y);
 if(u.style.y>0.5){if(u.style.z>0.5){return vec4f(u.ground.rgb*0.72*0.16,0.16);}
 let light=select(clamp((o.tint.g-27.0/255.0)/(18.0/255.0),0.0,1.0),o.tint.g,o.canopyKind>0.0);
 let rock=smoothstep(0.12,0.58,slope)*u.climate.x;
 let snow=u.climate.y*smoothstep(u.climate.z,u.climate.z+u.climate.w,o.world.y)*(1-smoothstep(0.25,0.68,slope));
 let granite=smoothstep(0.34,0.65,slope)*smoothstep(650.0,1200.0,o.world.y);
 var base=mix(mix(mix(u.ground.rgb,u.rock.rgb,rock),vec3f(0.4,0.42,0.44),granite),vec3f(0.89,0.92,0.95),snow);
 let landUV=o.world.xz/farmland.bounds.x+0.5;
 let field=textureSample(farmlandMap,farmlandSampler,clamp(landUV,vec2f(0),vec2f(1)));
 let atlasSize=textureDimensions(farmlandMap);
 let fieldData=textureLoad(farmlandMap,clamp(vec2i(landUV*vec2f(atlasSize)),vec2i(0),vec2i(atlasSize)-1),0).rgb;
 let forestMaterial=1-step(0.15,fieldData.g+fieldData.b);
 let cropValue=fieldData.r*255.0/223.0;
 let edge=max(fwidth(field.a),0.002);
 var cultivated=smoothstep(0.5-edge,0.5+edge,field.a)*(1-smoothstep(0.06,0.19,slope));
 cultivated*=step(0.0,landUV.x)*step(landUV.x,1.0)*step(0.0,landUV.y)*step(landUV.y,1.0);
 if(u.climate.z>0.0){cultivated*=1-snow;}
 cultivated*=1-forestMaterial;
 var cropIndex=4u;if(cropValue<0.27){cropIndex=0u;}else if(cropValue<0.51){cropIndex=1u;}else if(cropValue<0.74){cropIndex=2u;}else if(cropValue<0.96){cropIndex=3u;}
 let direction=normalize(fieldData.gb*2-1+vec2f(0.0001));
 let row=dot(o.world.xz,direction)/8;
 let furrow=sin(row*6.2831853)*0.09*(1-smoothstep(0.2,0.7,fwidth(row)));
 base=mix(base,farmland.colors[cropIndex].rgb*(1+furrow),cultivated*0.86);
 let treeType=select(step(0.96,fieldData.r),step(0.7,o.canopyKind),o.canopyKind>0.0);
 var leaf=mix(vec3f(0.11,0.25,0.065),vec3f(0.065,0.18,0.11),treeType);
 var crown=sin(o.world.x*0.17+sin(o.world.z*0.11))*sin(o.world.z*0.15+sin(o.world.x*0.13))*0.14;
 crown*=1-smoothstep(0.3,1.2,max(fwidth(o.world.x),fwidth(o.world.z))*0.1);
 leaf*=0.94+crown;
 if(u.ground.r>0.6&&u.climate.z>0.0){leaf=mix(leaf,vec3f(0.31,0.30,0.13),0.7);}
 let winter=u.climate.y*(1-step(0.0,u.climate.z));
 leaf=mix(leaf,vec3f(0.73,0.79,0.76),winter*clamp(abs(normal.y)*0.58+0.15+crown,0.0,1.0));
 var forestWeight=forestMaterial*smoothstep(0.5-edge,0.5+edge,field.a)*(1-smoothstep(0.20,0.55,slope))*(1-smoothstep(1500.0,2100.0,o.world.y));
 if(o.canopyKind>0.0){forestWeight=1.0;}
 base=mix(base,leaf,forestWeight);
 let color=base*(0.48+0.52*light)*(0.78+grain*0.42)*u.style.x;
 let fog=smoothstep(u.haze.w*0.18,u.haze.w,o.depth)*0.72;return vec4f(mix(color,u.haze.rgb,fog),1);}
 if(u.style.z>0.5){var alpha=0.32;if(o.depth<3200){alpha=0.72;}else if(o.depth<10000){alpha=0.54;}return vec4f(vec3f(115.0,163.0,96.0)/255.0*alpha,alpha);}
 return vec4f(o.tint,1);
}
`;
export const features =
  uniforms +
  `
@group(0) @binding(3) var<storage,read> visibility:array<u32>;
struct Out {@builtin(position) position:vec4f,@location(0) tint:vec3f,@location(1) depth:f32,@location(2) @interpolate(flat) kind:u32,@location(3) @interpolate(flat) detail:u32};
@vertex fn vs(@location(0) position:vec3f,@location(1) color:vec3f,@location(2) kind:f32,@location(3) detail:f32,@location(4) patchIndex:f32)->Out {
 var o:Out;o.tint=color;o.kind=u32(kind);o.detail=u32(detail);let relative=position-u.translation.xyz;o.depth=(u.view*relative).z;o.position=project(relative);
 if(visibility[u32(patchIndex)]==0u){o.position=vec4f(2,2,2,1);}return o;
}
@fragment fn fs(o:Out)->@location(0) vec4f {
 if((o.detail==1u&&o.depth>=4000)||(o.detail==2u&&o.depth>=2200)){discard;}
 let alpha=select(clamp((10500-o.depth)/3500,0,1),clamp((36000-o.depth)/12000,0,1),o.kind==0u);
 return vec4f(o.tint*u.style.x*alpha,alpha);
}
`;
export const horizon =
  uniforms +
  `
@vertex fn vs(@builtin(vertex_index) id:u32)->@builtin(position) vec4f {let p=vec2f(f32((id<<1u)&2u),f32(id&2u));return vec4f(p*2-1,0,1);}
@fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f {
 let pixel=position.xy/u.boundSize.w;let ray=u.rotation*vec3f((pixel.x-u.screen.x*0.5)/u.screen.z,(u.screen.y*0.53-pixel.y)/u.screen.z,1);
 let turn=fract(atan2(ray.x,ray.z)/6.28318530718+1);let uv=1-abs(2*turn-1);
 if(u.integrity.w>1.5){
  let direction=normalize(ray);let skyUV=vec2f(turn,0.5-asin(clamp(direction.y,-1.0,1.0))/3.14159265359);let texel=2.0/vec2f(textureDimensions(surfaceMap));
  var night=textureSample(surfaceMap,surfaceSampler,skyUV).rgb;
  night=min(night,textureSample(surfaceMap,surfaceSampler,skyUV+vec2f(texel.x,0)).rgb);
  night=min(night,textureSample(surfaceMap,surfaceSampler,skyUV-vec2f(texel.x,0)).rgb);
  night=min(night,textureSample(surfaceMap,surfaceSampler,skyUV+vec2f(0,texel.y)).rgb);
  night=min(night,textureSample(surfaceMap,surfaceSampler,skyUV-vec2f(0,texel.y)).rgb);
  let alpha=smoothstep(0.0,0.08,direction.y);return vec4f(night*alpha*0.75,alpha);
 }
 let elevation=atan2(ray.y,length(ray.xz))+u.screen.w;let v=(elevation+0.12)/0.34;
 if(u.integrity.w>0.5){
 let e=elevation;let bearing=atan2(ray.x,ray.z);let shoreAngle=atan2(sin(bearing-3.14159265359),cos(bearing-3.14159265359));
 let edge=max(fwidth(e),0.00006);if(e>0.14){discard;}
 let band=exp(-pow(e/0.026,2));var sea=mix(vec3f(0.10,0.30,0.42),vec3f(0.32,0.49,0.59),smoothstep(-0.16,0,e));
 sea+=vec3f(0.006,0.009,0.011)*sin(e*1800+sin(turn*25.132741)*0.4)*smoothstep(-0.11,-0.025,e)*(1-smoothstep(-0.025,0,e));
 var tone=mix(sea,vec3f(0.48,0.65,0.73),band*0.55);var alpha=select(1-smoothstep(0,0.14,e),1.0,e<=0);
 let coast=1-smoothstep(1.45,2.0943951,abs(shoreAngle));let dunes=0.004+0.002*sin(bearing*11)+0.001*sin(bearing*23);
 let city=1-smoothstep(0.85,1.90,abs(shoreAngle));let block=floor((shoreAngle+0.5)*180);let seed=fract(sin(block*127.1)*43758.5453);
 let tower=city*(0.004+0.015*seed*seed);let roof=coast*(dunes+tower);
 let land=coast*(1-smoothstep(roof-edge,roof+edge,e))*smoothstep(-0.004,0.001,e);
 var sand=mix(vec3f(0.53,0.56,0.50),vec3f(0.65,0.64,0.52),smoothstep(0.001,0.006,e));if(e>coast*dunes){sand=vec3f(0.30,0.41,0.47);}
 tone=mix(tone,sand,land*0.93);alpha=max(alpha,land);return vec4f(tone*alpha,alpha);
 }
 let mountain=textureSample(surfaceMap,surfaceSampler,vec2f(uv,clamp(1-v,0.001,0.999)));
 if(v>1){discard;}var tone=mix(mountain.rgb,vec3f(0.10,0.145,0.13),0.24);tone=mix(vec3f(0.055,0.118,0.086),tone,smoothstep(-0.08,0.2,v));
 if(u.style.y>0.5){tone=mix(mountain.rgb*0.85*u.style.x,u.haze.rgb,0.45);tone=mix(u.haze.rgb*0.6,tone,smoothstep(-0.08,0.2,v));}
 return vec4f(tone*mountain.a,mountain.a);
}
`;

export const aircraftShadows =
  uniforms +
  `
struct Out {@builtin(position) position:vec4f,@location(0) alpha:f32};
@vertex fn vs(@location(0) position:vec3f,@location(1) opacity:f32)->Out {
 var o:Out;o.position=project(position);o.alpha=opacity;return o;
}
@fragment fn fs(o:Out)->@location(0) vec4f {return vec4f(0,0,0,o.alpha);}
`;
