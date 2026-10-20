import {Vec3,clamp} from './math.js';
import {weaponProfiles,stepMissile,missileLaunchVelocity,guidedLaunchStatus} from './weaponDynamics.js';
import {combatSource} from './unitCombat.js';
import {radarContact} from './sensors.js';
import {navigationJammed} from './electronicWarfare.js';
import {terrainHeight} from './terrain.js';
const side=p=>p.owner==='enemy'?'enemy':'ally';
export function seaRamThreat(ship,p){
 if(p.interceptor||!['aam','agm'].includes(p.type)||side(p)===(ship.team==='enemy'?'enemy':'ally'))return false;
 const relative=p.position.clone().sub(ship.position),velocity=p.velocity.clone().sub(ship.velocity),closing=-relative.dot(velocity)/Math.max(1,relative.length());
 if(closing<=0)return false;const assigned=p.targetEntityId||p.targetId;
 if(assigned)return assigned===ship.id;
 const time=clamp(-relative.dot(velocity)/Math.max(1,velocity.dot(velocity)),0,20);
 return relative.add(velocity.scale(time)).length()<200;
}
export function launchSeaRam(ship,player,targets,w,state,dt){
 state.ramRounds??=2;state.ramCooldown=Math.max(0,(state.ramCooldown||0)-dt);
 if(state.ramRounds<=0||state.ramCooldown>0||w.missionEnded)return;
 state.ramCooldown=.2;const profile=weaponProfiles.ram,source=combatSource(ship,player),owner=ship.team==='enemy'?'enemy':'ally';
 if(navigationJammed(source,targets)||w.projectiles.filter(p=>p.owner===owner).length>=220)return;
 const covered=new Set(w.projectiles.filter(p=>p.interceptor&&p.owner===owner&&!p.seekerLost).map(p=>p.targetProjectileId));
 const threats=w.projectiles.filter(p=>!covered.has(p.id)&&seaRamThreat(ship,p)&&ship.position.distance(p.position)<profile.maxRange&&radarContact(source,{...p,kind:'air'}));
 threats.sort((a,b)=>ship.position.distance(a.position)/Math.max(1,a.velocity.length())-ship.position.distance(b.position)/Math.max(1,b.velocity.length()));
 for(const threat of threats){const target={position:threat.position,velocity:threat.velocity,kind:'air'},status=guidedLaunchStatus(source,target,profile);if(!status.canLaunch)continue;
  const position=ship.position.clone().add(new Vec3(ship.type==='carrier'?30:6,ship.type==='carrier'?25:16,-30)),velocity=missileLaunchVelocity(ship.velocity,threat.position.clone().sub(position),profile,{ground:true});
  const p={id:++w.sequence,type:'aam',interceptor:true,owner,sourceId:ship.id,targetProjectileId:threat.id,profile,position,previous:position.clone(),velocity,age:0,travelled:0,trailTimer:0,trailAnchor:position.clone(),damage:0};
  w.projectiles.push(p);state.ramRounds--;state.ramCooldown=2;
  w.emit({type:'interceptor-launch',sourceId:ship.id,projectileId:p.id,targetProjectileId:threat.id,protectedId:ship.id,owner,profile:profile.id,position:position.clone(),distanceM:ship.position.distance(threat.position),launchRangeM:status.maxRange,remaining:state.ramRounds});return;
 }
}
export function interceptionPoint(interceptor,threat,nextThreat){
 if(!interceptor.armed)return null;
 const a=interceptor.previous.clone().sub(threat.position),b=interceptor.position.clone().sub(nextThreat),delta=b.sub(a),t=clamp(-a.dot(delta)/Math.max(1e-12,delta.dot(delta)),0,1);
 return a.add(delta.scale(t)).length()<=interceptor.profile.fuseRadius?interceptor.previous.clone().add(interceptor.position.clone().sub(interceptor.previous).scale(t)):null;
}
// Interceptors are handled before ordinary impact resolution, independent of array order.
// The threat's next segment is predicted with its current velocity for this 120 Hz tick.
export function updateSeaRam(w,player,targets,dt){
 if(!w.projectiles.some(p=>p.interceptor))return [];
 const byId=new Map(w.projectiles.map(p=>[p.id,p])),destroyed=new Set(),survivors=[];
 for(const p of w.projectiles){if(!p.interceptor)continue;const threat=byId.get(p.targetProjectileId);p.previous=p.position.clone();p.age+=dt;
  if(!threat||destroyed.has(threat.id)){w.emit({type:'interceptor-end',projectileId:p.id,sourceId:p.sourceId,reason:'target-gone'});continue;}
  stepMissile(p,{position:threat.position,velocity:threat.velocity},null,dt);p.position.add(p.velocity.clone().scale(dt));
  if(p.age<p.profile.burn){p.trailTimer+=dt;if(p.trailTimer>=.045){w.trails.push({from:p.trailAnchor.clone(),to:p.position.clone(),velocity:p.velocity.clone().normalize(),life:3.5,maxLife:3.5});p.trailAnchor=p.position.clone();p.trailTimer%=.045;}}
  const point=interceptionPoint(p,threat,threat.position.clone().add(threat.velocity.clone().scale(dt)));
  if(point){destroyed.add(threat.id);w.explode(point,'aam');w.emit({type:'missile-intercept',sourceId:p.sourceId,projectileId:p.id,targetProjectileId:threat.id,threatSourceId:threat.sourceId,position:point});continue;}
  if(p.position.y<=terrainHeight(p.position.x,p.position.z)||p.age>=p.profile.life){w.emit({type:'interceptor-end',projectileId:p.id,sourceId:p.sourceId,reason:'expired-or-surface'});continue;}
  survivors.push(p);
 }
 w.projectiles=w.projectiles.filter(p=>!p.interceptor&&!destroyed.has(p.id));return survivors;
}
