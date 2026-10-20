import {Vec3,Quat} from './math.js';
import {groundInstances,buildingDetail} from './groundModels.js';
import {terrainWorld} from './terrain.js';
const caches=new WeakMap(),rotation=new Quat();
// Static city buildings share GPU submissions. Combat still uses each original
// building and collision box, independently of this render-only batch.
export function cityBatches(renderer,targets){
 const city=targets.filter(t=>t.city&&!t.exited);if(!city.length)return [];
 let cache=caches.get(city[0]);if(!cache||cache.revision!==terrainWorld.revision){cache={revision:terrainWorld.revision,groups:new Map()};caches.set(city[0],cache);}
 const groups=new Map();for(const t of city){const level=buildingDetail(t,renderer.camera,renderer.focal),key=level+':'+(t.alive!==false);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
 const result=[];for(const [key,buildings]of groups){
  const signature=buildings.map(t=>[t.id,t.position.x,t.position.y,t.position.z,t.heading,t.buildingHeight,t.buildingWidth,t.buildingDepth].join(':')).join('|');let saved=cache.groups.get(key);
  if(saved?.signature!==signature){const position=buildings.reduce((p,t)=>p.add(t.position),new Vec3()).scale(1/buildings.length),points=[],faces=[],details=[],level=key.split(':')[0];
   for(const t of buildings)for(const instance of groundInstances(t,{detail:level})){const base=points.length;for(const p of instance.mesh.points)points.push(instance.rotation.rotate(p).add(instance.position).sub(position));for(const face of instance.mesh.faces||[])faces.push(face.map(i=>i+base));for(const edge of instance.mesh.details||[])details.push(edge.map(i=>i+base));}
   const mesh={points,faces,details,radius:Math.max(...points.map(p=>p.length()))};saved={signature,mesh,position};cache.groups.set(key,saved);
  }
  result.push({mesh:saved.mesh,position:saved.position,color:key.endsWith('true')?'#8dbed4':'#56645b'});
 }
 return result;
}
export function renderCityVisuals(renderer,targets){for(const {mesh,position,color}of cityBatches(renderer,targets))renderer.mesh(mesh,position,rotation,1,color,null,'concrete');}
