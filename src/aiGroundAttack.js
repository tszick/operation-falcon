import {Vec3,clamp,DEG} from './math.js';
import {terrainHeight} from './terrain.js';
import {navigationLimits} from './formationAI.js';
import {enemyProfile,gunLead} from './weaponDynamics.js';
import {combatSource} from './unitCombat.js';
export function groundAttackPlan(t,target,stores){
 if(!['fighter','bomber'].includes(t.type)||target?.kind!=='ground'||!target.alive||t.retreat||t.evasion){delete t.groundAttack;return null;}
 const bomber=t.type==='bomber',limits=navigationLimits(t),ground=terrainHeight(target.position.x,target.position.z),range=Math.hypot(target.position.x-t.position.x,target.position.z-t.position.z);
 let pass=t.groundAttack;
 if(!pass||pass.targetId!==target.id){const axis=target.position.clone().sub(t.position);axis.y=0;if(axis.length()<1)axis.z=1;axis.normalize();if(range<4000){axis.x=Math.sin(t.heading);axis.z=Math.cos(t.heading);}pass=t.groundAttack={targetId:target.id,axis,stage:bomber||range>=4000?'approach':'egress',altitude:Math.max(t.position.y,ground+1500)};}
 const along=t.position.clone().sub(target.position).dot(pass.axis);
 if(pass.stage==='approach'&&range<6500)pass.stage='run';
 if(pass.stage==='run'&&(range<650||along>0||t.position.y<ground+160))pass.stage='egress';
 if(pass.stage==='egress'&&along>3800)pass.stage='reposition';
 let position;
 if(pass.stage==='egress')position=target.position.clone().add(pass.axis.clone().scale(5000));
 else if(pass.stage==='reposition'){position=target.position.clone().sub(pass.axis.clone().scale(9000));const bearing=target.position.clone().sub(t.position);bearing.y=0;bearing.normalize();if(range>4000&&range<15000&&bearing.x*Math.sin(t.heading)+bearing.z*Math.cos(t.heading)>.94){pass.axis=bearing;pass.stage='run';position=target.position.clone();}}
 else position=target.position.clone();
 position.y=ground+(bomber?pass.altitude-ground:pass.stage==='run'?200:950);
 // Set up a shallow strafe rather than orbiting horizontally above the battery.
 if(pass.stage==='run'&&!bomber){const slope=stores.agm>0?.20:.14;position.y=Math.max(ground+180,ground+range*slope);}
 const speed=clamp(bomber?t.cruiseSpeed||145:stores.agm>0?210:170,limits.minSpeed,limits.maxSpeed);let verticalSpeed;
 if(!bomber&&pass.stage==='run'&&range<1900&&stores.rounds>0&&stores.agm<=0){const profile=enemyProfile(t,'gun');if(profile){const solution=gunLead({...combatSource(t),muzzlePosition:t.position},target,profile);if(solution.reachable)verticalSpeed=clamp(solution.direction.y/Math.max(.1,Math.hypot(solution.direction.x,solution.direction.z))*Math.hypot(t.velocity.x,t.velocity.z),-75,30);}}
 return {role:'strike',leaderId:t.defendId||t.id,mode:'ground-attack',groundAttack:true,stage:pass.stage,position,targetSpeed:speed,minSpeed:limits.minSpeed,maxSpeed:limits.maxSpeed,afterburner:false,bankLimit:(bomber?30:45)*DEG,...(verticalSpeed===undefined?{}:{verticalSpeed})};
}
