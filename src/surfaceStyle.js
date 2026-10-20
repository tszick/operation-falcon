// Experimental palettes and small local textures. No network assets or geometry changes.
const style=options=>({texture:'terrain',rock:[.36,.35,.31],rockiness:.6,snow:0,snowLine:1000,snowRange:600,textureScale:700,hazeDistance:38000,...options});
export const surfaceStyles={
 vector:style({label:'Eredeti vektoros',sky:['#081619','#23392d','#07100c'],terrain:[.06,.14,.09],stars:1,light:1}),
 ocean:style({label:'Nappali nyílt tenger',sky:['#245d9b','#779eaf','#66889a'],terrain:[.10,.30,.42],rockiness:0,stars:0,light:1,texture:'terrain-sea',textureScale:240,hazeDistance:45000}),
 grass:style({label:'Füves táj · kék ég',sky:['#245482','#8ab4c3','#b6c6b4'],terrain:[.28,.38,.18],stars:0,light:1}),
 desert:style({label:'Sivatag · poros ég',sky:['#426a83','#aeb5ad','#d5bc94'],terrain:[.72,.55,.33],rock:[.45,.34,.25],texture:'terrain-sand',rockiness:.45,textureScale:480,hazeDistance:27000,stars:0,light:1}),
 rocky:style({label:'Sziklás hegyvidék',sky:['#304c6c','#93a8b4','#bfc7c6'],terrain:[.44,.43,.39],rock:[.32,.33,.34],texture:'terrain-rock',rockiness:1,snow:.85,snowLine:1250,snowRange:650,textureScale:550,stars:0,light:.94}),
 sunset:style({label:'Naplemente',sky:['#242c54','#bd776b','#e7b282'],terrain:[.40,.34,.22],rock:[.39,.30,.28],stars:.14,light:.76,sun:true,hazeDistance:32000}),
 night:style({label:'Csillagos éjszaka',sky:['#020510','#101a30','#252d3b'],terrain:[.19,.22,.28],rock:[.24,.26,.31],stars:1,light:.5,hazeDistance:28000}),
 winter:style({label:'Tél · borús, havas táj',sky:['#535e6d','#9ca6af','#d1d5d7'],terrain:[.86,.89,.91],rock:[.34,.37,.40],texture:'terrain-snow',rockiness:.9,snow:1,snowLine:-200,snowRange:250,textureScale:430,clouds:true,stars:0,light:.86,hazeDistance:26000})
};
export const surfaceStyle=id=>surfaceStyles[id]||surfaceStyles.vector;
export const materialIds={aircraft:1,camo:2,concrete:3,hangar:4,terrain:5,asphalt:6};
export function materialFor(kind){return kind==='air'?'aircraft':['truck','convoy','sam','sam-system','jammer','target-range','ballistic-silo'].includes(kind)?'camo':'concrete';}
export function materialPixels(kind,size=256){
 const data=new Uint8Array(size*size*4);let seed=5219;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const u=x/size,v=y/size,grain=(seed/4294967296-.5),field=kind==='camo'||kind.startsWith('terrain')?Math.sin(u*Math.PI*4+Math.sin(v*Math.PI*4))+Math.cos(v*Math.PI*6+Math.sin(u*Math.PI*2)):0;let c;
  if(kind==='camo')c=field>.6?[96,103,65]:field<-.55?[48,59,39]:[126,124,84];
  else if(kind.startsWith('terrain')){
   const n=140+field*14+grain*24;
   if(kind==='terrain-sand'){const ripple=Math.sin((u*24+Math.sin(v*6)*.6)*Math.PI*2)*9;c=[150+ripple+field*10+grain*12,145+ripple+field*8,136+ripple];}
   else if(kind==='terrain-rock'){const strata=Math.sin((v*18+Math.sin(u*9)*.3)*Math.PI*2)*13,crack=Math.abs(Math.sin(u*29+v*17))<.06?-25:0;c=[n+strata+crack,n+strata+crack-3,n+strata+crack-5];}
   else if(kind==='terrain-sea'){const wave=Math.sin(u*31+Math.sin(v*9))*5+Math.sin(v*39+u*7)*3;c=[135+wave,148+wave,157+wave];}
   else if(kind==='terrain-snow'){const drift=Math.sin(u*17+Math.sin(v*12))*4;c=[183+drift+grain*11,187+drift+grain*9,192+drift+grain*7];}
   else c=[n,n,n];
  }
  else if(kind==='asphalt')c=[43+grain*12,46+grain*12,48+grain*12];
  else if(kind==='hangar'){
   const door=u>.12&&u<.88&&v>.09&&v<.83,rib=(u*64)%1<.16?-19:0;
   c=door?[66+rib,76+rib,81+rib]:[157+rib,163+rib,164+rib];
   if(door&&((v*12)%1<.035||Math.abs(u-.5)<.006))c=[28,35,39];
   if((Math.abs(u-.12)<.012||Math.abs(u-.88)<.012)&&v>.075&&v<.85||Math.abs(v-.09)<.012&&u>.11&&u<.89)c=[191,195,191];
   if(v>.76&&v<.80&&(Math.abs(u-.48)<.009||Math.abs(u-.52)<.009))c=[187,171,106];
  }
  else if(kind==='aircraft'){const panel=x%64<1||y%128<1;c=panel?[98,106,114]:[162,170,177];}
  else c=[159,161,155];
  const i=(y*size+x)*4;for(let k=0;k<3;k++)data[i+k]=Math.max(0,Math.min(255,c[k]+grain*(kind==='concrete'?18:7)));data[i+3]=255;
 }
 return data;
}
export class SurfaceTextures{
 constructor(gl){this.gl=gl;this.cache=new Map();this.anisotropy=gl.getExtension?.('EXT_texture_filter_anisotropic');}
 bind(kind,unit=0){const g=this.gl;g.activeTexture(g.TEXTURE0+unit);let texture=this.cache.get(kind);if(!texture){texture=g.createTexture();g.bindTexture(g.TEXTURE_2D,texture);const size=kind==='hangar'?512:256;g.texImage2D(g.TEXTURE_2D,0,g.RGBA,size,size,0,g.RGBA,g.UNSIGNED_BYTE,materialPixels(kind,size));g.generateMipmap(g.TEXTURE_2D);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR_MIPMAP_LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.REPEAT);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.REPEAT);if(this.anisotropy)g.texParameterf(g.TEXTURE_2D,this.anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,g.getParameter(this.anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));this.cache.set(kind,texture);}g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,texture);}
}

const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
// Shared slope/altitude palette for the CPU fallback; the GPU uses the same blend.
export function terrainTint(id,normalY,height,light=1){
 const p=surfaceStyle(id),slope=1-Math.abs(normalY),rock=smooth(.12,.58,slope)*p.rockiness;
 const snow=p.snow*smooth(p.snowLine,p.snowLine+p.snowRange,height)*(1-smooth(.25,.68,slope));
 return p.terrain.map((v,i)=>{const stone=v*(1-rock)+p.rock[i]*rock;return (stone*(1-snow)+[.89,.92,.95][i]*snow)*(.48+.52*light)*p.light;});
}

export function missionSurface(mission,random=Math.random,previous=null){if(mission.naval)return 'ocean';const options=Object.keys(surfaceStyles).filter(k=>!['vector','ocean',previous].includes(k));return options[Math.min(options.length-1,Math.max(0,Math.floor(random()*options.length)))];}
