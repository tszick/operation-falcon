import {Vec3,clamp} from './math.js';
import {terrainWorld,terrainHeight,pathCoordinates,pathPoint} from './terrain.js';
export function terrainFeatureVisible(camera,point){
 const delta=point.clone().sub(camera),horizontal=Math.hypot(delta.x,delta.z),steps=Math.min(80,Math.ceil(horizontal/100));
 for(let i=1;i<steps;i++){const t=i/steps,p=camera.clone().add(delta.clone().scale(t));if(terrainHeight(p.x,p.z)>p.y+1.5)return false;}
 return true;
}
export function roadSurface(path,p,x=0,z=0){const ground=terrainHeight(p.x+x,p.z+z)+.8;if(!terrainWorld.bridge)return ground;const t=Math.abs(pathCoordinates(path,p.x,p.z).along),half=terrainWorld.bridge.span*.5,blend=clamp((half+220-t)/220,0,1);return ground*(1-blend)+(terrainWorld.river.level+16.1)*blend;}
function roadWet(path,t){if(!terrainWorld.river||terrainWorld.bridge)return false;const p=pathPoint(path,t);return Math.abs(pathCoordinates(terrainWorld.river,p.x,p.z).across)<terrainWorld.river.width*.5+15;}
export function roadSection(path,t,length,width=path.width){
 const a=pathPoint(path,t),b=pathPoint(path,t+length),dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
 return [[a,1],[a,-1],[b,-1],[b,1]].map(([p,side])=>{const x=nx*width*.5*side,z=nz*width*.5*side;return new Vec3(p.x+x,roadSurface(path,p,x,z),p.z+z);});
}
export function riverSection(path,t,length,width=path.width){
 // Shared endpoints use the same cross-section in adjacent patches. Also use
 // the terrain channel's coordinates, so the water edge meets the bank exactly.
 const nx=-Math.sin(path.angle)*width*.5,nz=Math.cos(path.angle)*width*.5;
 return [[t,1],[t,-1],[t+length,-1],[t+length,1]].map(([along,side])=>{const p=pathPoint(path,along);return new Vec3(p.x+nx*side,path.level,p.z+nz*side);});
}
export function projectFeaturePolygon(r,points){
 // Clip polygons crossing the camera plane instead of discarding the whole tile.
 const input=points.map(p=>r.local(p)),clipped=[];
 for(let i=0;i<input.length;i++){const a=input[i],b=input[(i+1)%input.length],insideA=a.z>=1,insideB=b.z>=1;if(insideA)clipped.push(a);if(insideA!==insideB)clipped.push(a.clone().add(b.clone().sub(a).scale((1-a.z)/(b.z-a.z))));}
 return clipped.map(p=>({x:r.w*.5+p.x*r.focal/p.z,y:r.h*.53-p.y*r.focal/p.z,depth:p.z}));
}
function fill(c,screen,color){c.fillStyle=color;c.beginPath();screen.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fill();}
export function renderTerrainFeatures(r){
 const c=r.ctx,patches=[];
 for(const kind of ['river','road']){const path=terrainWorld[kind];if(!path)continue;const center=pathCoordinates(path,r.camera.x,r.camera.z).along,step=kind==='river'?100:30,extent=kind==='river'?36000:10000;
  for(let t=Math.floor((center-extent)/step)*step;t<center+extent;t+=step){const a=pathPoint(path,t);if(kind==='road'&&(path.min!==undefined?t<path.min||t>path.max:Math.hypot(a.x,a.z)<4500))continue;
   let pts;if(kind==='road'){if(roadWet(path,t)||roadWet(path,t+step))continue;pts=roadSection(path,t,step,path.width+5);}
   else pts=riverSection(path,t,step);
   const screen=projectFeaturePolygon(r,pts);if(screen.length<3)continue;
   if(screen.every(p=>p.x<0)||screen.every(p=>p.x>r.w)||screen.every(p=>p.y<0)||screen.every(p=>p.y>r.h))continue;
   const midpoint=pts.reduce((p,v)=>p.add(v),new Vec3()).scale(.25);if(!terrainFeatureVisible(r.camera,midpoint))continue;
   patches.push({screen,pts,kind,path,t,step,depth:screen.reduce((v,p)=>v+p.depth,0)/screen.length});
  }
 }
 patches.sort((a,b)=>b.depth-a.depth);for(const {screen,pts,kind,path,t,step,depth}of patches){
  if(kind==='river'){
   c.save();c.globalAlpha=clamp((36000-depth)/12000,0,1);fill(c,screen,'#20505b');
   // Subtle wet bank bands give the filled water a shore, not a neon outline.
   const shore=riverSection(path,t,step,path.width+18);for(const ids of [[0,3],[1,2]]){const [a,b]=ids,bank=[pts[a],pts[b],shore[b].clone(),shore[a].clone()];for(let i=2;i<4;i++)bank[i].y=terrainHeight(bank[i].x,bank[i].z)+.3;const polygon=projectFeaturePolygon(r,bank);if(polygon.length>=3)fill(c,polygon,'#394b40');}
   if(depth<9000){c.strokeStyle='#78aaa76b';c.lineWidth=.5;c.beginPath();for(const [a,b]of [[0,3],[1,2]])r.line(pts[a],pts[b]);c.stroke();}c.restore();continue;
  }
  // A surfaced ribbon with shoulders, not two constant-brightness horizon lines.
  c.save();c.globalAlpha=clamp((10500-depth)/3500,0,1);fill(c,screen,'#565346');const asphalt=projectFeaturePolygon(r,roadSection(path,t,step,path.width));if(asphalt.length>=3)fill(c,asphalt,'#151d20');
  if(depth<4000){for(const side of [-1,1]){const edge=roadSection(path,t,step,path.width-.7),a=side<0?edge[0]:edge[1],b=side<0?edge[3]:edge[2];c.strokeStyle='#bdbca0';c.lineWidth=clamp(.2*r.focal/depth,.25,1.2);c.beginPath();r.line(a,b);c.stroke();}}
  if(depth<2200){for(let mark=t;mark<t+step;mark+=12){const dash=projectFeaturePolygon(r,roadSection(path,mark,3,.18));if(dash.length>=3)fill(c,dash,'#d8d1a7');}}
  c.restore();
 }
}
