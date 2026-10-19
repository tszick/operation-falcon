import {DEG,forward,clamp} from './math.js';
// Contacts within this small reticle area are distinguished by actual range.
export const reticleRadius=1.5*DEG;
const byRange=(a,b)=>a.distance-b.distance||a.angle-b.angle||String(a.target.id).localeCompare(String(b.target.id));
const squad=c=>c.target.kind==='air'?String(c.target.radioCallSign?.flight??c.target.squad??'ungrouped'):null;
function reticleContact(contacts){const angle=Math.min(...contacts.map(c=>c.angle)),near=contacts.filter(c=>c.angle<=(angle<=reticleRadius?reticleRadius:angle+1e-8));return near.sort(byRange)[0];}
export class TargetCycle{
 reset(){this.route=null;}
 choose(contacts,orientation,currentId){
  if(!contacts.length){this.reset();return null;}
  const first=reticleContact(contacts),direction=forward(orientation),current=contacts.find(c=>c.target.id===currentId),route=this.route;
  // A deliberate new aim starts at that enemy; ordinary repeated Tab presses keep
  // traversing the same squad even if its members move across the reticle.
  const reaim=route&&first.target.id!==currentId&&first.angle<=reticleRadius&&current?.angle>first.angle+2*DEG&&Math.acos(clamp(direction.dot(route.direction),-1,1))>4*DEG;
  let next;
  if(!route||route.lastId!==currentId||!current||reaim){next=first;this.route={visited:new Set(),group:squad(first),direction};}
  else{
   const remaining=contacts.filter(c=>!route.visited.has(c.target.id)),air=remaining.filter(c=>c.target.kind==='air');
   next=air.filter(c=>squad(c)===route.group).sort(byRange)[0]||air.sort(byRange)[0]||remaining.sort(byRange)[0];
   if(!next){next=first;this.route={visited:new Set(),group:squad(first),direction};}
  }
  this.route.visited.add(next.target.id);this.route.group=squad(next);this.route.lastId=next.target.id;return next.target.id;
 }
}
