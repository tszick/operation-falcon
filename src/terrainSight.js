import {clamp} from './math.js';
import {terrainWorld} from './terrain.js';
// Conservative upper bound along a horizontal sight segment, shared by visual
// occlusion and weapon support; the callers keep their own sampling/clearance rules.
export function terrainSightCeiling(camera,point){
 const dx=point.x-camera.x,dz=point.z-camera.z;
 // Bound only terrain that can meet this sight ray. A remote high peak must
 // not force every smoke puff to ray-march across the entire map.
 const length2=dx*dx+dz*dz,roadMargin=terrainWorld.road?terrainWorld.road.width*.5+18:0;
 let ceiling=Math.max(555,terrainWorld.canyon?.training?930:0,terrainWorld.site?.height||0,(terrainWorld.river?.level||0)+8);
 for(const peak of terrainWorld.peaks){const t=clamp(((peak.x-camera.x)*dx+(peak.z-camera.z)*dz)/Math.max(1e-12,length2),0,1),distance=Math.max(0,Math.hypot(peak.x-camera.x-dx*t,peak.z-camera.z-dz*t)-(peak.platform||0)-roadMargin);ceiling=Math.max(ceiling,peak.height*Math.exp(-2.8*(distance/peak.radius)**2));}
 return ceiling;
}
