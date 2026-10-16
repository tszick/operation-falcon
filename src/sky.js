import {Vec3} from './math.js';

// Deterministic hemisphere: directions do not depend on aircraft position or time.
export function createStars(count=1500){
 let seed=217063;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 return Array.from({length:count},(_,i)=>{const y=(i+.4)/count,angle=i*2.399963229728653,r=Math.sqrt(1-y*y);return {direction:new Vec3(Math.cos(angle)*r,y,Math.sin(angle)*r),brightness:.28+random()*.65,size:random()>.92?1.5:.65+random()*.5};});
}
export function projectStar(star,basis,width,height,focal){
 const d=star.direction,z=d.dot(basis.f);
 if(z<=0)return null;
 const x=width*.5+d.dot(basis.r)*focal/z,y=height*.53-d.dot(basis.u)*focal/z;
 return x>=0&&x<=width&&y>=0&&y<=height?{x,y}:null;
}
export function starOccluded(direction,position,heightAt){
 if(direction.y>.18)return false;
 for(const distance of[400,800,1600,2400,4000,6000,9000,12000]){
  if(heightAt(position.x+direction.x*distance,position.z+direction.z*distance)>position.y+direction.y*distance)return true;
 }
 return false;
}
