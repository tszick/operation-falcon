import {Vec3,Quat,forward} from './math.js';
import {weaponProfiles,gunEffectiveRange} from './weaponDynamics.js';
import {armament} from './armament.js';
export const hasTailGun=s=>!!s.spec.defensiveGun;
export function tailGunPose(s){
 const mount=s.spec.defensiveGun;if(!mount)return null;
 const aim=s.rearAim||{yaw:0,pitch:0},orientation=s.orientation.clone().multiply(Quat.euler(Math.PI+(aim.yaw||0),aim.pitch||0,0)),direction=forward(orientation),axis=s.orientation.rotate(new Vec3(0,0,-1));
 return {origin:s.position.clone().add(s.orientation.rotate(new Vec3(...mount.offset))),orientation,direction,inArc:axis.dot(direction)>=Math.cos(mount.aftHalfAngle)};
}
export function tailGunStatus(s){
 const block=(status,label)=>({canFire:false,status,label});
 if(!s.rearView)return block('station','V: VÁLTS A HÁTSÓ LÖVÉSZÁLLÁSBA');
 if(!hasTailGun(s)||!armament(s.spec).tailGun)return block('unequipped','EHHEZ A GÉPHEZ NINCS FAROKGÉPÁGYÚ');
 if(s.training)return block('training','GYAKORLAT · FEGYVERZET NÉLKÜL');
 if(s.dying||s.crashed||(s.condition?.parts.weapons??1)<=.35)return block('disabled','FAROKGÉPÁGYÚ ÜZEMKÉPTELEN');
 if(s.onGround)return block('ground','FAROKGÉPÁGYÚ CSAK REPÜLÉS KÖZBEN');
 if(!(s.ammo.tailGun>0))return block('empty','ELFOGYOTT A FAROKGÉPÁGYÚ LŐSZERE');
 const pose=tailGunPose(s);if(!pose.inArc)return block('angle','TÜZELÉSI SZEKTORON KÍVÜL');
 const profile=weaponProfiles[s.spec.defensiveGun.profile];
 return {canFire:true,status:'ready',label:'FAROKGÉPÁGYÚ · TŰZKÉSZ',profile,pose,effectiveRange:gunEffectiveRange(s,profile)};
}
export function setRearView(s,head,enabled){
 if(enabled&&!hasTailGun(s))return false;
 s.rearView=!!enabled;s.rearAim={yaw:0,pitch:0};head.reset();head.rear=!!enabled;head.hold=!!enabled;
 head.limits=enabled?{yaw:s.spec.defensiveGun.aftHalfAngle,pitchUp:s.spec.defensiveGun.aftHalfAngle,pitchDown:s.spec.defensiveGun.aftHalfAngle}:null;
 return true;
}
