import {createAircraft} from './physics.js';
import {Vec3,Quat,DEG,clamp} from './math.js';
import {runway,terrainHeight} from './terrain.js';
import {mass,atmosphere,approachSpeeds} from './performance.js';
import {evaluateApproach} from './landing.js';
export const landingStart={distance:6000,glide:3,fuelFraction:.15};
export function defaultMissionFuel(mission){return mission.objective==='landing'?landingStart.fuelFraction:1;}
export function createMissionAircraft(spec,mission,{fuelFraction=defaultMissionFuel(mission)}={}){
 const s=createAircraft(spec);s.fuel=spec.fuelCapacity*(Number.isFinite(fuelFraction)?clamp(fuelFraction,0,1):defaultMissionFuel(mission));s.enginePower=s.fuel>0?1:0;if(mission.airStart){s.onGround=false;s.airborne=true;s.gear=false;s.flaps=false;s.flapPosition=0;s.landingMode='off';s.position=new Vec3(0,1700,-9000);const air=atmosphere(1700),v=165;s.velocity=new Vec3(0,0,v);const q=.5*air.density*v*v,alpha=clamp((mass(s)*9.81/(q*spec.wingArea)-.22)/spec.clSlope,0,.2);s.orientation=Quat.euler(0,alpha,0);s.throttle=.65;s.speed=v;s.ias=v*Math.sqrt(air.density/1.225);s.mach=v/air.soundSpeed;s.agl=1700-terrainHeight(0,-9000);s.previousPosition=s.position.clone();return s;}if(mission.objective!=='landing')return s;
 s.training=true;s.ammo={gun:0,aam:0,agm:0,bomb:0};
 s.onGround=false;s.airborne=true;s.gear=false;s.flaps=false;s.flapPosition=0;s.afterburner=false;s.landingMode='off';
 const glide=landingStart.glide*DEG,height=2+landingStart.distance*Math.tan(glide),air=atmosphere(height),ias=(approachSpeeds(s).target+25)/3.6,v=ias/Math.sqrt(air.density/1.225),q=.5*air.density*v*v,m=mass(s),cl=m*9.81*Math.cos(glide)/(q*spec.wingArea),alpha=clamp((cl-.22)/spec.clSlope,0,spec.stallAlpha*.85);
 s.position=new Vec3(0,height,-runway.halfLength-landingStart.distance);s.previousPosition=s.position.clone();s.velocity=new Vec3(0,-v*Math.sin(glide),v*Math.cos(glide));s.orientation=Quat.euler(0,alpha-glide,0);
 const drag=q*spec.wingArea*(spec.cd0+spec.inducedDrag*cl*cl),available=spec.thrust*clamp(air.density/1.225,.23,1)*clamp(1-v/(spec.maxMach*air.soundSpeed)*.22,.4,1);
 s.throttle=clamp((drag-m*9.81*Math.sin(glide))/Math.max(1,available*Math.cos(alpha)),.08,.75);s.speed=v;s.ias=ias;s.mach=v/air.soundSpeed;s.alpha=alpha;s.g=Math.cos(glide);s.agl=height-terrainHeight(0,s.position.z);s.enginePower=s.fuel>0?1:0;s.approach=evaluateApproach(s);return s;
}
