import {Vec3,clamp} from './math.js';
import {terrainHeight,terrainWorld} from './terrain.js';
import {projectFeaturePolygon} from './terrainFeatures.js';
// One connected grid: no overlapping transparent near/far wire meshes or LOD gaps.
const outer=[10000,12000,15000,18000,22000,28000,36000,48000];
const offsets=[...outer.map(x=>-x).reverse(),...Array.from({length:41},(_,i)=>(i-20)*450),...outer];
export function buildTerrainSurface(cx,cz,heightAt=terrainHeight){
 const points=offsets.map(z=>offsets.map(x=>new Vec3(cx+x,heightAt(cx+x,cz+z),cz+z))),faces=[];
 const add=pts=>{const normal=pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0])).normalize();if(normal.y<0)normal.scale(-1);
  const light=clamp(normal.dot(new Vec3(-.36,.86,-.36)),0,1);
  faces.push({points:pts,center:pts.reduce((p,v)=>p.add(v),new Vec3()).scale(1/3),color:`rgb(${Math.round(12+light*8)},${Math.round(27+light*18)},${Math.round(20+light*10)})`});};
 for(let z=0;z<points.length-1;z++)for(let x=0;x<points.length-1;x++){const a=points[z][x],b=points[z][x+1],c=points[z+1][x+1],d=points[z+1][x];add([a,b,c]);add([a,c,d]);}
 return faces;
}
export function renderTerrainSurface(r){
 const cx=Math.round(r.camera.x/450)*450,cz=Math.round(r.camera.z/450)*450,key=`${terrainWorld.revision}:${cx}:${cz}`;
 if(r.terrainSurfaceKey!==key){r.terrainSurfaceKey=key;r.terrainSurface=buildTerrainSurface(cx,cz);}
 if(r.gpuModels?.renderTerrain(r))return;
 if(r.debugMetrics)r.terrainMetrics={backend:'Canvas2D',triangles:r.terrainSurface.length};
 const faces=[],localCache=new Map();
 for(const face of r.terrainSurface){const screen=projectFeaturePolygon(r,face.points,localCache);if(screen.length<3||screen.every(p=>p.x<0)||screen.every(p=>p.x>r.w)||screen.every(p=>p.y<0)||screen.every(p=>p.y>r.h))continue;faces.push({...face,screen,depth:r.local(face.center).z});}
 faces.sort((a,b)=>b.depth-a.depth);
 const c=r.ctx;c.save();c.lineJoin='round';c.lineWidth=1;
 for(const face of faces){c.beginPath();face.screen.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();
  // Opaque fill covers the far slope, stars and all previously painted grid lines.
  c.fillStyle=face.color;c.fill();c.strokeStyle=face.color;c.stroke();
  const alpha=face.depth<3200?.72:face.depth<10000?.54:.32;
  c.strokeStyle=`rgba(115,163,96,${alpha})`;c.lineWidth=face.depth<6500?1.05:.8;c.stroke();
 }
 c.restore();
}
