import {Vec3,Quat,attitude,forward,clamp,DEG} from './math.js';
import {aircraftFlightSpec} from './aiAircraftSpec.js';
import {createCountermeasures,deployCountermeasures,updateCountermeasures,decoyKind} from './countermeasures.js';
import {teamOf} from './unitTypes.js';
import {terrainHeight} from './terrain.js';
import {mass,atmosphere} from './performance.js';
import {damageResponse} from './damage.js';

// Keep dispensers independent of flight-physics creation: an intact AI otherwise
// uses its existing lightweight movement. Damage must not replenish its stock.
export function defenseState(t){
 const previous=t.defense,flight=t.flight;
 if(flight){if(previous&&previous!==flight)flight.countermeasures=previous.countermeasures;t.defense=flight;return flight;}
 const s=t.defense??={spec:aircraftFlightSpec(t.aircraftId||'mig29'),throttle:.65,afterburner:false,fuel:1};
 Object.assign(s,{position:t.position,velocity:t.velocity,orientation:Quat.euler(t.heading||0,t.pitch||0,t.bank||0),damage:t.damage||0,onGround:t.aiRole==='takeoff',dying:!!t.falling,crashed:false});
 s.countermeasures??=createCountermeasures(s.spec);return s;
}
export const militaryAircraft=t=>t.kind==='air'&&t.type!=='ballistic'&&!t.civilian&&t.faction!=='neutral';
export function retreatReason(t){
 const s=t.flight;if(!s||s.dying||s.crashed)return '';
 if(s.damage>=40)return 'structural-damage';
 if(s.condition?.parts.weapons<=.35)return 'weapons-failure';
 return '';
}
function beginRetreat(t,targets,player,w){
 const side=teamOf(t,player),bases=targets.filter(u=>u.type==='airbase'&&teamOf(u,player)===side),home=bases.sort((a,b)=>t.position.distance(a.position)-t.position.distance(b.position))[0],homePosition=home?.position.clone()||t.position.clone().sub(forward(t.flight.orientation).scale(12000));
 const hostileBase=targets.find(u=>u.type==='airbase'&&teamOf(u,player)!==side&&teamOf(u,player)!=='neutral'),outward=hostileBase?homePosition.clone().sub(hostileBase.position):homePosition.clone().sub(t.position);outward.y=0;if(outward.length()<1)outward.z=-1;outward.normalize();
 t.retreat={reason:retreatReason(t),stage:'home',homeId:home?.id||null,home:homePosition,exit:homePosition.clone().add(outward.scale(18000))};t.aiRole='returning';t.aiTargetId=null;t.flight.afterburner=false;
 w.emit({type:'ai-retreat',sourceId:t.id,owner:side,reason:t.retreat.reason,homeId:t.retreat.homeId,position:t.position.clone()});
}
export function updateAIDefense(player,targets,w,dt){
 // One projectile pass, rather than rescanning the entire list for each aircraft.
 const incoming=new Map();
 for(const p of w.projectiles){if(!['aam','agm'].includes(p.type)||p.seekerLost||p.decoyId!==undefined)continue;const id=p.targetEntityId||p.targetId;if(!id)continue;const list=incoming.get(id)||[];list.push(p);incoming.set(id,list);}
 for(const t of targets){
  if(!militaryAircraft(t)||t.pending)continue;
  if(!t.alive||t.exited||t.falling){if(t.defense)updateCountermeasures(t.defense,dt);continue;}
  const s=defenseState(t);updateCountermeasures(s,dt);if(s.dying||s.crashed||s.onGround)continue;
  // The protected transport keeps its mission exit route instead of abandoning it.
  if(!t.retreat&&t.aiRole!=='escortee'&&retreatReason(t))beginRetreat(t,targets,player,w);
  for(const p of incoming.get(t.id)||[]){
   if((p.owner||'ally')===teamOf(t,player))continue;
   const kind=decoyKind(p.profile);if(!kind)continue;
   const delta=t.position.clone().sub(p.position),distance=delta.length(),closing=p.velocity.clone().sub(t.velocity).dot(delta.clone().normalize());
   // A short reaction delay, finite detection range and time-to-impact window.
   if(p.age<.35||distance>4500||closing<=0||distance/closing>7)continue;
   t.defenseReaction??=new Map();const seen=t.defenseReaction.get(p.id)??s.countermeasures.clock;t.defenseReaction.set(p.id,seen);
   if(s.countermeasures.clock-seen<.35)continue;
   const result=deployCountermeasures(s,kind);if(result.released)w.emit({type:'countermeasure-release',sourceId:t.id,owner:teamOf(t,player),kind,projectileId:p.id,flare:s.countermeasures.flare,chaff:s.countermeasures.chaff,position:t.position.clone()});
  }
  if(t.defenseReaction)for(const id of t.defenseReaction.keys())if(!(incoming.get(t.id)||[]).some(p=>p.id===id))t.defenseReaction.delete(id);
 }
}
export function retreatFlightInput(t,dt){
 const s=t.flight,r=t.retreat;if(!s||!r||s.dying||s.crashed)return {};
 const distance=p=>Math.hypot(p.x-s.position.x,p.z-s.position.z);
 if(r.stage==='home'&&distance(r.home)<2500)r.stage='exit';
 // Exit only by physically reaching the departure point, never on a timeout.
 if(r.stage==='exit'&&distance(r.exit)<1200){t.exited=true;t.retired=true;t.alive=false;r.stage='departed';return {};}
 return guidedFlightInput(t,r.stage==='home'?r.home:r.exit);
}
export function combatFlightInput(t){
 const goal=t.navigationGoal;if(!goal)return {};
 return guidedFlightInput(t,goal.position,{altitude:goal.kind==='ground'?1800:goal.position.y,bankLimit:35*DEG});
}
export function guidedFlightInput(t,goal,{altitude=1500,bankLimit=25*DEG}={}){
 const s=t.flight,a=attitude(s.orientation),heading=Math.atan2(goal.x-s.position.x,goal.z-s.position.z),error=Math.atan2(Math.sin(heading-a.heading),Math.cos(heading-a.heading)),bank=clamp(error*.8,-bankLimit,bankLimit),v=s.velocity.length(),response=damageResponse(s);
 const nose=forward(s.orientation);for(const ahead of [0,1500,3500])altitude=Math.max(altitude,terrainHeight(s.position.x+nose.x*ahead,s.position.z+nose.z*ahead)+650);
 const q=.5*atmosphere(s.position.y).density*v*v,alpha=clamp((mass(s)*9.81/Math.max(1,q*s.spec.wingArea*response.lift*Math.max(.5,Math.cos(a.bank)))-.22)/s.spec.clSlope,0,s.spec.stallAlpha*.7),pitch=alpha+Math.atan2(clamp((altitude-s.position.y)*.025,-8,14),Math.max(50,v));
 const authority=clamp(q/2800,.06,1),rates=s.condition.rates,pitchTrim=(rates.pitch||0)/Math.max(.01,s.spec.pitchRate*DEG*authority*response.pitchControl),rollTrim=(rates.roll||0)/Math.max(.01,s.spec.rollRate*DEG*authority*response.rollControl);
 return {yaw:clamp(-(rates.yaw||0)/Math.max(.005,.07*response.control),-1,1),pitch:clamp((pitch-a.pitch)*2-pitchTrim,-.65,.65),roll:clamp((bank-a.bank)*2-rollTrim,-.65,.65),throttle:clamp((Math.max(s.spec.approachSpeed*1.5,t.cruiseSpeed||160)-v)*.01,-.2,.2)};
}
