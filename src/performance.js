import {clamp} from './math.js';
import {damageResponse} from './damage.js';
import {weaponProfile} from './weaponDynamics.js';

export function atmosphere(h){const t=288.15-.0065*clamp(h,0,11000);return {density:1.225*Math.exp(-Math.max(0,h)/8500),soundSpeed:Math.sqrt(1.4*287.05*t)};}
// Gun profiles describe the projectile. The 2.2 factor is an approximate
// complete-round allowance (projectile, case and propellant), not extra gun mass.
export function ammoMass(spec,type,count){const profile=count>0?weaponProfile(spec,type):null;return profile?count*profile.mass*(type==='gun'?2.2:1):0;}
export function massBreakdown(s){
 const gunAmmoKg=ammoMass(s.spec,'gun',s.ammo.gun||0),missilesKg=ammoMass(s.spec,'aam',s.ammo.aam||0)+ammoMass(s.spec,'agm',s.ammo.agm||0),bombsKg=ammoMass(s.spec,'bomb',s.ammo.bomb||0);
 const emptyKg=s.spec.emptyMass,fuelKg=s.fuel,storesKg=missilesKg+bombsKg;
 return {emptyKg,fuelKg,gunAmmoKg,missilesKg,bombsKg,storesKg,totalKg:emptyKg+fuelKg+gunAmmoKg+storesKg};
}
export function mass(s){return massBreakdown(s).totalKg;}
// Reference speeds are indicated airspeeds, using the landing flap configuration.
// A loaded aircraft needs a larger margin above the lift-limited stall speed.
export function approachSpeeds(s){
 const maximumCL=s.spec.maxCL+.35;
 const stall=Math.sqrt(2*mass(s)*9.81/(1.225*s.spec.wingArea*maximumCL*Math.max(.05,damageResponse(s).lift)));
 const target=Math.max(s.spec.approachSpeed,1.23*stall)*3.6;
 return {stall:stall*3.6,target,min:target-25,max:target+30};
}
export function approachSpeedAction(s){
 const speeds=approachSpeeds(s),speed=s.ias*3.6,target=Math.round(speeds.target);
 if(s.afterburner&&s.spec.hasAB)return {key:'SHIFT',text:'Utánégető kikapcsolása',done:false};
 if(speed>speeds.max){
  if(s.throttle>.02)return {key:'F',text:`Gáz alapjáratra · cél ${target} km/h`,done:false};
  if(!s.airbrake)return {key:'B',text:`Légfék nyitása · cél ${target} km/h`,done:false};
  return {key:'S',text:'Finoman: enyhítsd a süllyedést; hagyj időt a lassulásra',done:false};
 }
 if(s.airbrake)return {key:'B',text:'Légfék bezárása; ne lassulj tovább',done:false};
 if(speed<speeds.min)return {key:'R',text:`Finoman növeld a gázt · ${target} km/h`,done:false};
 return {key:'R / F',text:`Tarts kb. ${target} km/h-t`,done:true};
}
