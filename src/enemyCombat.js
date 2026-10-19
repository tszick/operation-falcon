import {aiMissileDecision} from './aiFireDiscipline.js';
import {defensiveFireSolution} from './defensiveGunnery.js';
import {aircraftFlightSpec} from './aiAircraftSpec.js';
import {combatSource} from './unitCombat.js';
import {radarContact} from './sensors.js';
import {navigationJammed} from './electronicWarfare.js';
import {teamOf,unitDefinition} from './unitTypes.js';
import {Vec3,clamp,forward} from './math.js';
import {threatsFor} from './threats.js';
import {armament} from './armament.js';
import {enemyProfile,missileEnvelope,gunLead,spreadDirection,clearWeaponLine,predictBombImpact,weaponProfiles,missileLaunchVelocity,guidedLaunchStatus,gunEffectiveRange} from './weaponDynamics.js';
import {Quat} from './math.js';
export const clearFireLine=clearWeaponLine;
// Solve |relativePosition + relativeVelocity * t| = projectileSpeed * t.
// A vanishing quadratic coefficient leaves a linear equation, not range / speed.
export function interceptTime(position,velocity,source,speed){
 const r=position.clone().sub(source),v2=velocity.dot(velocity),c=r.dot(r);
 if(c<1e-12)return 0;if(!Number.isFinite(speed)||speed<=0)return null;
 const a=v2-speed*speed,b=2*r.dot(velocity),tolerance=1e-10*Math.max(1,v2,speed*speed);
 if(Math.abs(a)<=tolerance){if(b>=0)return null;return -c/b;}
 const disc=b*b-4*a*c;if(disc<0)return null;
 // Stable quadratic evaluation avoids subtracting nearly equal numbers.
 const q=-.5*(b+(b<0?-1:1)*Math.sqrt(disc)),roots=q===0?[-b/(2*a)]:[q/a,c/q],future=roots.filter(t=>Number.isFinite(t)&&t>=0);
 return future.length?Math.min(...future):null;
}
export class EnemyCombat{
 constructor(){this.units=new Map();this.activeTime=0;}
 unit(t){if(!this.units.has(t.id)){const preset=t.type==='fighter'?armament({id:t.aircraftId}):null;this.units.set(t.id,{seed:t.combatSeed??1234,missile:2,flak:1,gun:1,flakBurst:0,gunBurst:0,missiles:preset?preset.weapons.aam?.quantity||0:6,shells:90,rounds:preset?preset.weapons.gun?.quantity||0:t.type==='bomber'?aircraftFlightSpec(t.aircraftId||'tu95').defensiveGun?.rounds||0:1800,bombs:12,bomb:0,lock:0});}const unit=this.units.get(t.id);unit.initialMissiles??=unit.missiles;return unit;}
 random(u){u.seed=(Math.imul(u.seed,1664525)+1013904223)>>>0;return u.seed/4294967296;}
 steer(t,s,dt){if(t.type!=='fighter'||t.aiRole==='takeoff'||t.flight)return;const distance=t.position.distance(s.position);const ordered=t.aiTargetId!=null&&t.aiTargetId===s.id;if(distance>16000&&!ordered&&!radarContact(combatSource(t,s),s))return;const lead=Math.min(3,distance/1000),desired=Math.atan2(s.position.x+s.velocity.x*lead-t.position.x,s.position.z+s.velocity.z*lead-t.position.z),error=Math.atan2(Math.sin(desired-t.heading),Math.cos(desired-t.heading)),rate=distance>16000?.04:.12,turn=clamp(error,-rate*dt,rate*dt),speed=t.cruiseSpeed||145;t.heading+=turn;t.bank=Math.atan(speed*(turn/dt)/9.81);t.velocity.x=Math.sin(t.heading)*speed;t.velocity.z=Math.cos(t.heading)*speed;t.velocity.y=clamp((s.position.y-t.position.y)*.035,-22,22);t.pitch=Math.atan2(t.velocity.y,speed);}
 launch(kind,t,s,w,u,solution=null){
  const ground=t.kind==='ground',origin=solution?.origin.clone()||t.position.clone().add(new Vec3(0,ground?5:0,0)),carrier=ground?new Vec3():t.velocity.clone(),profile=solution?.profile||(kind==='flak'?null:enemyProfile(t,kind==='missile'?'aam':'gun'));let velocity,fuse;
  if(kind==='missile')velocity=missileLaunchVelocity(carrier,ground?s.position.clone().sub(origin):forward(t.flight?.orientation||Quat.euler(t.heading||0,t.pitch||0,t.bank||0)),profile,{ground});
  else if(kind==='gun'){const orientation=t.flight?.orientation||Quat.euler(t.heading||0,t.pitch||0,t.bank||0),shooter={position:origin,muzzlePosition:origin,velocity:carrier,orientation},direction=solution?.direction||(t.type==='fighter'?forward(orientation):gunLead(shooter,{position:s.position,velocity:s.velocity},profile).direction);velocity=spreadDirection(direction,profile.dispersion*(1+(t.damage||0)*.006),()=>this.random(u)).scale(profile.muzzleSpeed).add(carrier);}
  else{const speed=680,relative=s.velocity.clone().sub(carrier),estimate=interceptTime(s.position,relative,origin,speed);if(estimate===null||estimate>15)return false;const time=Math.max(.03,estimate),aim=s.position.clone().add(relative.scale(time)).sub(origin).add(new Vec3(0,4.905*time*time,0)),direction=aim.clone().normalize(),side=new Vec3(0,1,0).cross(direction).normalize(),vertical=direction.cross(side).normalize(),spread=.006;
   direction.add(side.scale((this.random(u)-.5)*spread*2)).add(vertical.scale((this.random(u)-.5)*spread*2)).normalize();velocity=direction.scale(kind==='flak'?aim.length()/time:speed).add(carrier);fuse=time;
  }
  w.projectiles.push({id:++w.sequence,owner:t.team==='ally'?'ally':'enemy',type:kind==='missile'?'aam':kind,profile,targetPlayer:!s.id,targetEntityId:s.id||null,position:origin,previous:origin.clone(),velocity,age:0,travelled:0,fuse,damage:kind==='missile'?50:kind==='flak'?7:1.8,trailTimer:0,trailAnchor:origin.clone(),sourceId:t.id});
  w.emit({type:kind==='missile'?'missile-launch':'gun',position:origin.clone(),weapon:kind,owner:t.team==='ally'?'ally':'enemy',projectileId:w.sequence,sourceId:t.id,targetId:s.id||'PLAYER',profile:profile?.id,initialVelocity:velocity.clone(),...(solution?{turret:'tail',mainTargetId:u.missionTargetId,defensiveTargetId:s.id||'PLAYER',distanceM:solution.distance,launchRangeM:solution.effectiveRange}:{}),...(kind==='missile'?{distanceM:t.position.distance(s.position),radarRangeM:combatSource(t,s).spec.radarRange,launchRangeM:Math.min(profile.maxRange,u.launchRange??u.envelope?.maxRange??profile.maxRange),nominalRangeM:profile.maxRange}:{})});return true;
 }
 defensiveFire(t,player,targets,w,u,dt){
  u.gun-=dt;if(u.gun>0||u.rounds<=0)return;
  if(w.projectiles.filter(p=>p.owner===(t.team==='ally'?'ally':'enemy')).length>=220)return;
  const solution=defensiveFireSolution(t,player,targets);u.defensiveTargetId=solution?(solution.target.id||'PLAYER'):null;
  if(!solution){u.gun=.1;u.gunBurst=0;return;}
  if(!u.gunBurst)u.gunBurst=10;
  this.launch('gun',t,solution.target,w,u,solution);u.rounds--;u.gunBurst--;u.gun=u.gunBurst?.05:3+this.random(u)*2;
 }
 chooseTarget(t,player,targets){
  const side=teamOf(t,player),opponents=[...targets,player].filter(u=>u!==t&&u.alive!==false&&!u.crashed&&!u.dying&&!u.exited&&teamOf(u,player)!==side&&teamOf(u,player)!=='neutral'&&(u!==player||player.airborne&&!player.onGround&&player.agl>25));
  if(t.preferCity){const city=opponents.filter(u=>u.city);if(city.length)return city.sort((a,b)=>t.position.distance(a.position)-t.position.distance(b.position))[0];}
  // Missing assignments must not match the player, whose entity id is also undefined.
  const assigned=t.aiTargetId!=null?opponents.find(u=>u.id===t.aiTargetId):null;if(assigned)return assigned;
  // A designated base defender prioritizes a detected bomber threatening that base.
  if(t.defendId){const defended=targets.find(u=>u.id===t.defendId),source=combatSource(t,player),bombers=opponents.filter(u=>u.type==='bomber'&&u.aiTargetId===t.defendId&&!u.retreat&&radarContact(source,u));if(defended&&bombers.length)return bombers.sort((a,b)=>a.position.distance(defended.position)/Math.max(1,a.cruiseSpeed||145)-b.position.distance(defended.position)/Math.max(1,b.cruiseSpeed||145))[0];}
  const eligible=opponents.filter(u=>t.type==='bomber'?u.kind==='ground':t.kind==='ground'||t.type==='fighter'?u.kind==='air'||u===player:true);
  return eligible.sort((a,b)=>t.position.distance(a.position)-t.position.distance(b.position))[0];
 }
 update(player,targets,w,dt){
  const battle=targets.some(t=>t.team);if(!battle&&(!player.airborne||player.onGround||player.agl<25||player.crashed||player.dying))return;this.activeTime+=dt;if(this.activeTime<4)return;
  for(const t of targets){if(!t.alive||t.retreat||t.exited||t.aiRole==='takeoff'||t.type==='ballistic-silo'||t.civilian||t.faction==='neutral'||t.flight?.dying||t.flight?.crashed||t.flight?.condition?.parts.weapons<=.35)continue;
   const types=t.threats||threatsFor(t.type);if(!types.length)continue;
   const u=this.unit(t);let s=t.faction!==player.spec.faction?player:null;
   if(battle){s=u.choiceId==='@PLAYER'?player:targets.find(target=>target.id===u.choiceId);if(!s||s.alive===false||s.crashed||s.dying||s===player&&(!player.airborne||player.onGround||player.agl<25)||this.activeTime>=u.choiceUntil||u.assignment!==t.aiTargetId){s=this.chooseTarget(t,player,targets);u.choiceId=s===player?'@PLAYER':s?.id;u.choiceUntil=this.activeTime+.2;u.assignment=t.aiTargetId;}}u.missionTargetId=s?(s.id||'PLAYER'):null;if(t.type==='bomber'&&types.includes('gun'))this.defensiveFire(t,player,targets,w,u,dt);if(!s)continue;
   const goal=t.navigationGoal??={position:new Vec3()};Object.assign(goal.position,s.position);goal.kind=s.kind||'air';goal.targetId=s.id||'PLAYER';
   if(t.type==='bomber'&&!t.flight){const desired=Math.atan2(s.position.x-t.position.x,s.position.z-t.position.z),error=Math.atan2(Math.sin(desired-t.heading),Math.cos(desired-t.heading));t.heading+=clamp(error,-.045*dt,.045*dt);t.velocity=new Vec3(Math.sin(t.heading)*t.cruiseSpeed,clamp((1800-t.position.y)*.04,-12,12),Math.cos(t.heading)*t.cruiseSpeed);t.pitch=Math.atan2(t.velocity.y,t.cruiseSpeed);}
   this.steer(t,s,dt);if(u.targetId!==(s.id||'player')){u.targetId=s.id||'player';u.lock=0;u.envelope=null;}const distance=t.position.distance(s.position);if(!types.length)continue;u.missile-=dt;u.flak-=dt;if(t.type!=='bomber')u.gun-=dt;u.bomb-=dt;
   if(types.includes('bomb')&&s.kind==='ground'&&distance<Math.max(8000,Math.hypot(t.velocity.x,t.velocity.z)*Math.sqrt(Math.max(0,2*(t.position.y-s.position.y)/9.81))*1.5)&&u.bombs>0&&u.bomb<=0){if(!u.impact||this.activeTime>u.impactNext){u.impact=predictBombImpact({spec:{id:'f16'},position:t.position,velocity:t.velocity});u.impactAt=this.activeTime;u.impactNext=this.activeTime+.35+(u.seed%100)/1000;}if(Math.hypot(u.impact.x-s.position.x,u.impact.z-s.position.z)<150){const position=t.position.clone().add(new Vec3(0,-2,0));w.projectiles.push({id:++w.sequence,owner:t.team==='ally'?'ally':'enemy',type:'bomb',profile:weaponProfiles.mk82,position,previous:position.clone(),velocity:t.velocity.clone(),age:0,targetEntityId:s.id,sourceId:t.id,damage:100});u.bombs--;u.bomb=.35;w.emit({type:'bomb-release',position,owner:t.team==='ally'?'ally':'enemy',projectileId:w.sequence,sourceId:t.id,targetId:s.id,profile:'mk82',initialVelocity:t.velocity.clone()});}}

   const missileProfile=types.includes('missile')?enemyProfile(t,'aam'):null,source=missileProfile?combatSource(t,player):null;
   if(distance>Math.max(16000,missileProfile?.maxRange||0)||!clearFireLine(t.position.clone().add(new Vec3(0,5,0)),s.position)){u.lock=0;continue;}
   const vector=s.position.clone().sub(t.position).normalize(),nose=forward(t.flight?.orientation||Quat.euler(t.heading||0,t.pitch||0,t.bank||0)),angle=Math.acos(clamp(nose.dot(vector),-1,1));
   // Re-evaluate the expensive envelope at most twice a second per unit.
   if(missileProfile&&radarContact(source,s)&&!navigationJammed(source,targets)&&(!u.envelope||u.envelopeTarget!==(s.id||'player')||this.activeTime>u.envelopeAt+.5)){u.envelope=missileEnvelope(source,s,missileProfile);u.envelopeAt=this.activeTime;u.envelopeTarget=s.id||'player';}
   const missileEligible=!!missileProfile&&!!u.envelope&&!navigationJammed(source,targets)&&guidedLaunchStatus(source,s,missileProfile,{envelope:u.envelope}).canLaunch;u.lock=missileEligible?u.lock+dt:0;
   const fireDecision=missileProfile?aiMissileDecision(u,{canLaunch:missileEligible,distance,effectiveRange:u.envelope?.effectiveRange,maxRange:u.envelope?.maxRange,status:'not-ready'}):null;if(fireDecision)u.missileDecision=fireDecision;
   if(types.includes('missile')&&fireDecision.allow&&u.missiles>0&&u.lock>=(source.spec.lockTime??2)&&u.missile<=0&&w.projectiles.filter(p=>p.owner===(t.team==='ally'?'ally':'enemy')&&p.type==='aam').length<6){const finalStatus=guidedLaunchStatus(source,s,missileProfile),decision=aiMissileDecision(u,finalStatus);u.missileDecision=decision;if(decision.allow){u.launchRange=finalStatus.maxRange;this.launch('missile',t,s,w,u);u.missiles--;u.missile=12+this.random(u)*5;}}
   if(w.projectiles.filter(p=>p.owner===(t.team==='ally'?'ally':'enemy')).length>=220)continue;
   if(types.includes('flak')&&u.shells>0&&distance>500&&distance<(unitDefinition(t.type).flakRange||6500)&&(s.agl??s.position.y)>250&&(s.agl??s.position.y)<6500&&u.flak<=0){if(!u.flakBurst)u.flakBurst=3;if(this.launch('flak',t,s,w,u)){u.shells--;u.flakBurst--;u.flak=u.flakBurst?.3:5+this.random(u)*2;}else{u.flakBurst=0;u.flak=1;}}
   const gunProfile=types.includes('gun')?enemyProfile(t,'gun'):null,gunEligible=!!gunProfile&&distance<gunEffectiveRange(t,gunProfile)&&(t.kind!=='ground'||(s.agl??s.position.y)<900||s.kind==='ground')&&(t.type!=='fighter'||angle<.12);
   if(t.type!=='bomber'&&types.includes('gun')&&u.rounds>0&&gunEligible&&u.gun<=0){if(!u.gunBurst)u.gunBurst=10;this.launch('gun',t,s,w,u);u.rounds--;u.gunBurst--;u.gun=u.gunBurst?.05:3+this.random(u)*2;}
  }
 }
}
