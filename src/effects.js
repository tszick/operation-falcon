import {Vec3} from './math.js';

// Small deterministic particle sets, rendered as vector fragments and smoke contours.
export function explosionEffect(position,{heavy=false,ground=false,velocity=new Vec3(),seed=1}={}){
 let state=seed>>>0;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const scale=heavy?1.4:1;
 const particles=Array.from({length:ground?24:32},()=>{
  const az=random()*Math.PI*2,y=ground?.15+random()*.85:random()*2-1,r=Math.sqrt(1-y*y),speed=(25+random()*90)*scale;
  return {velocity:new Vec3(Math.cos(az)*r,y,Math.sin(az)*r).scale(speed),spin:random()*8+2,phase:random()*Math.PI*2,size:1+random()*3,hot:random()>.35};
 });
 const smoke=Array.from({length:8},()=>({offset:new Vec3((random()-.5)*18,random()*12,(random()-.5)*18),size:8+random()*14,phase:random()*6.28}));
 const maxLife=ground?5:4;
 return {kind:'explosion',position:position.clone(),velocity:velocity.clone(),particles,smoke,ground,scale,age:0,life:maxLife,maxLife};
}
export function impactEffect(position){return {kind:'impact',position:position.clone(),age:0,life:.55,maxLife:.55};}
