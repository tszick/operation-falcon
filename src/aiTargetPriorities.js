import {armament} from './armament.js';
import {combatSource} from './unitCombat.js';
import {radarContact} from './sensors.js';
import {clearWeaponLine} from './weaponDynamics.js';
import {unitDefinition} from './unitTypes.js';

export function attackStores(t,u){
 const p=armament({id:t.aircraftId||'mig29'}).weapons;
 return {air:!!p.aam&&u.missiles>0,ground:!!p.agm&&u.agm>0,gun:!!p.gun&&u.rounds>0,bomb:!!p.bomb&&u.bombs>0};
}
export function fighterTarget(t,player,targets,opponents,u,combatUnits){
 const stores=attackStores(t,u),source=combatSource(t,player),protectedUnit=targets.find(a=>a.id===t.defendId&&a.alive!==false),previous=u.choiceId,rows=[],protectedGroup=t.defendGroup?targets.filter(a=>a[t.defendGroup]&&a.alive!==false):[];
 for(const target of opponents){
  if(target.pending||target.retreat||target.falling||target.flight?.dying||target.flight?.crashed)continue;
  const ground=target.kind==='ground';if(ground?!stores.ground&&!stores.gun&&!stores.bomb:!stores.air&&!stores.gun)continue;
  if(protectedGroup.length&&Math.min(...protectedGroup.map(a=>a.position.distance(target.position)))>35000)continue;
  const distance=t.position.distance(target.position),detected=radarContact(source,target),visual=distance<12000&&clearWeaponLine(t.position,target.position);
  // Assignments supply a known objective, not permission to launch through terrain.
  const assigned=t.aiTargetId!=null&&t.aiTargetId===target.id;const knownGround=ground&&t.groundAttack?.targetId===target.id&&distance<25000;if(!detected&&!visual&&!assigned&&!knownGround)continue;
  let score=100-distance/1000,reason='opportunity';
  if(assigned){score+=180;reason='mission-objective';}
  const weapons=target.threats||unitDefinition(target.type).weapons;
  if(ground){
   const dangerous=weapons.some(w=>['missile','flak','gun','ballistic'].includes(w));
   if(dangerous){score+=80;reason='armed-ground-threat';}
   if(protectedUnit&&dangerous){
    const delta=target.position.clone().sub(protectedUnit.position),v=protectedUnit.velocity,hh=v.x*v.x+v.z*v.z,eta=hh?Math.max(0,Math.min(120,(delta.x*v.x+delta.z*v.z)/hh)):0;
    const miss=Math.hypot(delta.x-v.x*eta,delta.z-v.z*eta),range=weapons.includes('missile')?unitDefinition(target.type).radarRange||24000:weapons.includes('flak')?unitDefinition(target.type).flakRange||6500:1800;
    if(miss<range+1000&&(delta.length()<range+2500||eta>0&&eta<120)){score+=650-eta*2;reason='protected-route-threat';}
   }
  }else{
   score+=160;
   const assignment=target.aiTargetId||combatUnits.get(target.id)?.missionTargetId,attacking=protectedUnit&&(assignment===protectedUnit.id||protectedUnit.playerControlled&&assignment==='PLAYER'),near=protectedUnit?target.position.distance(protectedUnit.position):Infinity;
   if(protectedUnit&&(attacking||near<18000)){score+=300+Math.max(0,240-near/50);reason='protected-air-threat';}
   if(near<6000){score+=350;reason='immediate-air-threat';}
   if(target.type==='bomber'&&protectedGroup.length&&(target.preferCity&&t.defendGroup==='city'||protectedGroup.some(a=>a.id===assignment))){const distanceToGroup=Math.min(...protectedGroup.map(a=>a.position.distance(target.position))),eta=distanceToGroup/Math.max(1,target.cruiseSpeed||145);score+=400+Math.max(0,250-eta);reason='protected-area-bomber';}
   if(t.id&&assignment===t.id){score+=distance<4000?700:250;reason='self-defense';}
  }
  if(clearWeaponLine(t.position,target.position))score+=35;
  if(ground&&stores.ground&&distance<12000||!ground&&stores.air&&distance<8000)score+=45;
  if(ground&&stores.gun&&!stores.ground&&distance>5000)score-=70;
  if((target===player?'@PLAYER':target.id)===previous&&previous!=null)score+=45; // Avoid rapidly alternating otherwise similar targets.
  rows.push({target,score,reason});
 }
 rows.sort((a,b)=>b.score-a.score||t.position.distance(a.target.position)-t.position.distance(b.target.position));
 const selected=rows[0];u.targetDecision=selected?{targetId:selected.target.id,reason:selected.reason,score:selected.score}:null;return selected?.target||null;
}
