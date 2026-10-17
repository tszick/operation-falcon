import {teamOf,unitDefinition} from './unitTypes.js';
import {Vec3,clamp,forward} from './math.js';
import {threatsFor} from './threats.js';
import {armament} from './armament.js';
import {enemyProfile,missileEnvelope,gunLead,spreadDirection,clearWeaponLine,predictBombImpact,weaponProfiles,missileLaunchVelocity} from './weaponDynamics.js';
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
 unit(t){if(!this.units.has(t.id)){const preset=t.type==='fighter'?armament({id:t.aircraftId}):null;this.units.set(t.id,{seed:t.combatSeed??1234,missile:2,flak:1,gun:1,flakBurst:0,gunBurst:0,missiles:preset?preset.weapons.aam?.quantity||0:6,shells:90,rounds:preset?preset.weapons.gun?.quantity||0:1800,bombs:12,bomb:0,lock:0});}return this.units.get(t.id);}
 random(u){u.seed=(Math.imul(u.seed,1664525)+1013904223)>>>0;return u.seed/4294967296;}
 steer(t,s,dt){if(t.type!=='fighter'||t.flight||t.position.distance(s.position)>16000)return;const lead=Math.min(3,t.position.distance(s.position)/1000),desired=Math.atan2(s.position.x+s.velocity.x*lead-t.position.x,s.position.z+s.velocity.z*lead-t.position.z),error=Math.atan2(Math.sin(desired-t.heading),Math.cos(desired-t.heading)),turn=clamp(error,-.12*dt,.12*dt),speed=t.cruiseSpeed||145;t.heading+=turn;t.bank=Math.atan(speed*(turn/dt)/9.81);t.velocity.x=Math.sin(t.heading)*speed;t.velocity.z=Math.cos(t.heading)*speed;t.velocity.y=clamp((s.position.y-t.position.y)*.035,-22,22);t.pitch=Math.atan2(t.velocity.y,speed);}
 launch(kind,t,s,w,u){
  const ground=t.kind==='ground',origin=t.position.clone().add(new Vec3(0,ground?5:0,0)),carrier=ground?new Vec3():t.velocity.clone(),profile=kind==='flak'?null:enemyProfile(t,kind==='missile'?'aam':'gun');let velocity,fuse;
  if(kind==='missile')velocity=missileLaunchVelocity(carrier,ground?s.position.clone().sub(origin):forward(t.flight?.orientation||Quat.euler(t.heading||0,t.pitch||0,t.bank||0)),profile,{ground});
  else if(kind==='gun'){const orientation=t.flight?.orientation||Quat.euler(t.heading||0,t.pitch||0,t.bank||0),shooter={position:origin,muzzlePosition:origin,velocity:carrier,orientation},direction=t.type==='fighter'?forward(orientation):gunLead(shooter,{position:s.position,velocity:s.velocity},profile).direction;velocity=spreadDirection(direction,profile.dispersion*(1+(t.damage||0)*.006),()=>this.random(u)).scale(profile.muzzleSpeed).add(carrier);}
  else{const speed=680,relative=s.velocity.clone().sub(carrier),estimate=interceptTime(s.position,relative,origin,speed);if(estimate===null||estimate>15)return false;const time=Math.max(.03,estimate),aim=s.position.clone().add(relative.scale(time)).sub(origin).add(new Vec3(0,4.905*time*time,0)),direction=aim.clone().normalize(),side=new Vec3(0,1,0).cross(direction).normalize(),vertical=direction.cross(side).normalize(),spread=.006;
   direction.add(side.scale((this.random(u)-.5)*spread*2)).add(vertical.scale((this.random(u)-.5)*spread*2)).normalize();velocity=direction.scale(kind==='flak'?aim.length()/time:speed).add(carrier);fuse=time;
  }
  w.projectiles.push({id:++w.sequence,owner:t.team==='ally'?'ally':'enemy',type:kind==='missile'?'aam':kind,profile,targetPlayer:!s.id,targetEntityId:s.id||null,position:origin,previous:origin.clone(),velocity,age:0,travelled:0,fuse,damage:kind==='missile'?50:kind==='flak'?7:1.8,trailTimer:0,trailAnchor:origin.clone(),sourceId:t.id});
  w.emit({type:kind==='missile'?'missile-launch':'gun',position:origin.clone(),weapon:kind,owner:t.team==='ally'?'ally':'enemy',projectileId:w.sequence,sourceId:t.id,targetId:s.id||'PLAYER',profile:profile?.id,initialVelocity:velocity.clone()});return true;
 }
 chooseTarget(t,player,targets){
  const side=teamOf(t,player),opponents=[...targets,player].filter(u=>u!==t&&u.alive!==false&&!u.crashed&&!u.dying&&!u.exited&&teamOf(u,player)!==side&&teamOf(u,player)!=='neutral'&&(u!==player||player.airborne&&!player.onGround&&player.agl>25));
  const assigned=opponents.find(u=>u.id===t.aiTargetId);if(assigned)return assigned;
  const eligible=opponents.filter(u=>t.type==='bomber'?u.kind==='ground':t.kind==='ground'||t.type==='fighter'?u.kind==='air'||u===player:true);
  return eligible.sort((a,b)=>t.position.distance(a.position)-t.position.distance(b.position))[0];
 }
 update(player,targets,w,dt){
  const battle=targets.some(t=>t.team);if(!battle&&(!player.airborne||player.onGround||player.agl<25||player.crashed||player.dying))return;this.activeTime+=dt;if(this.activeTime<4)return;
  for(const t of targets){if(!t.alive||t.civilian||t.faction==='neutral'||t.flight?.dying||t.flight?.crashed||t.flight?.condition?.parts.weapons<.35)continue;
   const types=t.threats||threatsFor(t.type);if(!types.length)continue;
   const s=battle?this.chooseTarget(t,player,targets):t.faction!==player.spec.faction?player:null;if(!s)continue;
   if(t.type==='bomber'&&!t.flight){const desired=Math.atan2(s.position.x-t.position.x,s.position.z-t.position.z),error=Math.atan2(Math.sin(desired-t.heading),Math.cos(desired-t.heading));t.heading+=clamp(error,-.045*dt,.045*dt);t.velocity=new Vec3(Math.sin(t.heading)*t.cruiseSpeed,clamp((1800-t.position.y)*.04,-12,12),Math.cos(t.heading)*t.cruiseSpeed);t.pitch=Math.atan2(t.velocity.y,t.cruiseSpeed);}
   this.steer(t,s,dt);const u=this.unit(t);if(u.targetId!==(s.id||'player')){u.targetId=s.id||'player';u.lock=0;u.envelope=null;}const distance=t.position.distance(s.position);if(!types.length)continue;u.missile-=dt;u.flak-=dt;u.gun-=dt;u.bomb-=dt;
   if(types.includes('bomb')&&s.kind==='ground'&&u.bombs>0&&u.bomb<=0){if(!u.impact||this.activeTime>u.impactAt+.4){u.impact=predictBombImpact({spec:{id:'f16'},position:t.position,velocity:t.velocity});u.impactAt=this.activeTime;}if(Math.hypot(u.impact.x-s.position.x,u.impact.z-s.position.z)<150){const position=t.position.clone().add(new Vec3(0,-2,0));w.projectiles.push({id:++w.sequence,owner:t.team==='ally'?'ally':'enemy',type:'bomb',profile:weaponProfiles.mk82,position,previous:position.clone(),velocity:t.velocity.clone(),age:0,targetEntityId:s.id,sourceId:t.id,damage:100});u.bombs--;u.bomb=.35;w.emit({type:'bomb-release',position,owner:t.team==='ally'?'ally':'enemy',projectileId:w.sequence,sourceId:t.id,targetId:s.id,profile:'mk82',initialVelocity:t.velocity.clone()});}}

   const missileProfile=types.includes('missile')?enemyProfile(t,'aam'):null;
   if(distance>Math.max(16000,missileProfile?.maxRange||0)||!clearFireLine(t.position.clone().add(new Vec3(0,5,0)),s.position)){u.lock=0;continue;}
   const vector=s.position.clone().sub(t.position).normalize(),nose=forward(t.flight?.orientation||Quat.euler(t.heading||0,t.pitch||0,t.bank||0)),angle=Math.acos(clamp(nose.dot(vector),-1,1));
   // Re-evaluate the expensive envelope at most twice a second per unit.
   if(missileProfile&&(!u.envelope||u.envelopeTarget!==(s.id||'player')||this.activeTime>u.envelopeAt+.5)){u.envelope=missileEnvelope({position:t.position,velocity:t.velocity,ground:t.kind==='ground'},s,missileProfile);u.envelopeAt=this.activeTime;u.envelopeTarget=s.id||'player';}
   const missileEligible=!!missileProfile&&distance<Math.min(u.envelope.maxRange,missileProfile.maxRange)&&distance>missileProfile.minRange&&(t.type!=='fighter'||angle<Math.min(missileProfile.seeker,50*Math.PI/180));u.lock=missileEligible?u.lock+dt:0;
   if(types.includes('missile')&&u.missiles>0&&u.lock>=2&&u.missile<=0&&w.projectiles.filter(p=>p.owner==='enemy'&&p.type==='aam').length<6){this.launch('missile',t,s,w,u);u.missiles--;u.missile=12+this.random(u)*5;}
   if(w.projectiles.filter(p=>p.owner==='enemy').length>=220)continue;
   if(types.includes('flak')&&u.shells>0&&distance>500&&distance<6500&&(s.agl??s.position.y)>250&&(s.agl??s.position.y)<6500&&u.flak<=0){if(!u.flakBurst)u.flakBurst=3;if(this.launch('flak',t,s,w,u)){u.shells--;u.flakBurst--;u.flak=u.flakBurst?.3:5+this.random(u)*2;}else{u.flakBurst=0;u.flak=1;}}
   const gunProfile=types.includes('gun')?enemyProfile(t,'gun'):null,gunEligible=!!gunProfile&&distance<gunProfile.effectiveRange*(t.kind==='air'?1.2:1)&&(t.kind!=='ground'||(s.agl??s.position.y)<900||s.kind==='ground')&&(t.type!=='fighter'||angle<.12);
   if(types.includes('gun')&&u.rounds>0&&gunEligible&&u.gun<=0){if(!u.gunBurst)u.gunBurst=10;this.launch('gun',t,s,w,u);u.rounds--;u.gunBurst--;u.gun=u.gunBurst?.05:3+this.random(u)*2;}
  }
 }
}
