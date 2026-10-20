import {damagedVertex,modelFacePresent} from './modelDamage.js';
import {Vec3,Quat,clamp} from './math.js';
import {aircraftMesh} from './airframes.js';
export function faceDamagePart(mesh,index){
 const tag=mesh.faceParts?.[index]||'fuselage';if(tag!=='fuselage')return tag;
 const face=mesh.faces[index],centre=face.reduce((p,i)=>p.add(mesh.points[i]),new Vec3()).scale(1/face.length);
 if(centre.z>mesh.radius*.24)return 'weapons';
 if(centre.y<-.25&&Math.abs(centre.z)<mesh.radius*.28)return 'hydraulics';
 return 'fuselage';
}
function closestTriangle(p,a,b,c){
 const edge=b.clone().sub(a),other=c.clone().sub(a);
 if(edge.cross(other).length()<1e-9){let best=null;for(const [start,end] of [[a,b],[b,c],[c,a]]){const delta=end.clone().sub(start),t=clamp(p.clone().sub(start).dot(delta)/Math.max(1e-12,delta.dot(delta)),0,1),point=start.clone().add(delta.scale(t));if(!best||point.distance(p)<best.distance(p))best=point;}return best;}
 const ab=b.clone().sub(a),ac=c.clone().sub(a),ap=p.clone().sub(a),d1=ab.dot(ap),d2=ac.dot(ap);if(d1<=0&&d2<=0)return a.clone();
 const bp=p.clone().sub(b),d3=ab.dot(bp),d4=ac.dot(bp);if(d3>=0&&d4<=d3)return b.clone();
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return a.clone().add(ab.scale(d1/(d1-d3)));
 const cp=p.clone().sub(c),d5=ab.dot(cp),d6=ac.dot(cp);if(d6>=0&&d5<=d6)return c.clone();
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return a.clone().add(ac.scale(d2/(d2-d6)));
 const va=d3*d6-d5*d4;if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0)return b.clone().add(c.clone().sub(b).scale((d4-d3)/((d4-d3)+(d5-d6))));
 const sum=va+vb+vc;if(Math.abs(sum)<1e-12)return a.clone();return a.clone().add(ab.scale(vb/sum)).add(ac.scale(vc/sum));
}
function rayTriangle(from,direction,a,b,c){const edge1=b.clone().sub(a),edge2=c.clone().sub(a),h=direction.cross(edge2),det=edge1.dot(h);if(Math.abs(det)<1e-9)return null;const inv=1/det,s=from.clone().sub(a),u=inv*s.dot(h);if(u<0||u>1)return null;const q=s.cross(edge1),v=inv*direction.dot(q);if(v<0||u+v>1)return null;const t=inv*edge2.dot(q);return t>=0&&t<=1?t:null;}
// Geometry is immutable until wing integrity or the flap/sweep mesh changes.
// Weak keys avoid retaining retired aircraft or old model variants.
const intactGeometry=new WeakMap(),damagedGeometry=new WeakMap();
function collisionTriangles(mesh,condition){
 const left=condition?.parts.leftWing??1,right=condition?.parts.rightWing??1,intact=left>=.8&&right>=.8;
 let cache=intact?intactGeometry:damagedGeometry.get(condition);
 if(!cache){cache=new WeakMap();damagedGeometry.set(condition,cache);}
 const previous=cache.get(mesh);if(previous&&(intact||previous.left===left&&previous.right===right))return previous.triangles;
 const vertices=mesh.points.map((_,i)=>damagedVertex(mesh,i,condition)),triangles=[];
 for(let i=0;i<mesh.faces.length;i++){const face=mesh.faces[i];if(!modelFacePresent(mesh,face,condition))continue;
  const part=faceDamagePart(mesh,i),engineIndex=mesh.faceEngines?.[i]??null;
  for(let k=1;k<face.length-1;k++){const a=vertices[face[0]],b=vertices[face[k]],c=vertices[face[k+1]];
   triangles.push({a,b,c,part,engineIndex,x0:Math.min(a.x,b.x,c.x),x1:Math.max(a.x,b.x,c.x),y0:Math.min(a.y,b.y,c.y),y1:Math.max(a.y,b.y,c.y),z0:Math.min(a.z,b.z,c.z),z1:Math.max(a.z,b.z,c.z)});
  }
 }
 cache.set(mesh,{left,right,triangles});return triangles;
}
function outsideTriangleBounds(t,a,b,radius){
 return Math.max(a.x,b.x)<t.x0-radius||Math.min(a.x,b.x)>t.x1+radius||Math.max(a.y,b.y)<t.y0-radius||Math.min(a.y,b.y)>t.y1+radius||Math.max(a.z,b.z)<t.z0-radius||Math.min(a.z,b.z)>t.z1+radius;
}
function boundsDistanceSquared(t,p){const x=Math.max(t.x0-p.x,0,p.x-t.x1),y=Math.max(t.y0-p.y,0,p.y-t.y1),z=Math.max(t.z0-p.z,0,p.z-t.z1);return x*x+y*y+z*z;}
export function aircraftHit(s,from,to,{radius=.35,moving=true}={}){
 const mesh=aircraftMesh(s.spec.id,s.mach>.5?Math.min(1,(s.mach-.5)/.9):0,s.flapPosition??(s.flaps?1:0)),inverse=new Quat(-s.orientation.x,-s.orientation.y,-s.orientation.z,s.orientation.w);
 const a=inverse.rotate(from.clone().sub(moving?(s.previousPosition||s.position):s.position)),b=inverse.rotate(to.clone().sub(s.position)),direction=b.clone().sub(a),length2=direction.dot(direction);
 const mid=a.clone().add(direction.clone().scale(clamp(-a.dot(direction)/Math.max(1e-12,length2),0,1)));if(mid.length()>mesh.radius+radius)return null;
 let best=null;
 for(const triangle of collisionTriangles(mesh,s.condition)){if(outsideTriangleBounds(triangle,a,b,radius))continue;
  const {a:v0,b:v1,c:v2}=triangle,hit=rayTriangle(a,direction,v0,v1,v2);
  let fraction=hit,point;
  if(hit!==null)point=a.clone().add(direction.clone().scale(hit));
  else if(radius>0){const centre=v0.clone().add(v1).add(v2).scale(1/3);let t=clamp(centre.clone().sub(a).dot(direction)/Math.max(1e-12,length2),0,1);for(let pass=0;pass<3;pass++){point=closestTriangle(a.clone().add(direction.clone().scale(t)),v0,v1,v2);t=clamp(point.clone().sub(a).dot(direction)/Math.max(1e-12,length2),0,1);}if(point.distance(a.clone().add(direction.clone().scale(t)))<=radius)fraction=t;}
  if(fraction!==null&&(!best||fraction<best.fraction))best={fraction,localPoint:point,part:triangle.part,engineIndex:triangle.engineIndex,point:s.orientation.rotate(point).add(s.position)};
 }return best;
}
export function closestAircraftSurface(s,position){
 const mesh=aircraftMesh(s.spec.id,0,s.flapPosition??(s.flaps?1:0)),inverse=new Quat(-s.orientation.x,-s.orientation.y,-s.orientation.z,s.orientation.w),p=inverse.rotate(position.clone().sub(s.position));let best=null;
 for(const triangle of collisionTriangles(mesh,s.condition)){
  if(best&&boundsDistanceSquared(triangle,p)>best.distance*best.distance+1e-10)continue;
  const point=closestTriangle(p,triangle.a,triangle.b,triangle.c),distance=p.distance(point);
  if(!best||distance<best.distance)best={distance,part:triangle.part,engineIndex:triangle.engineIndex,localPoint:point,point:s.orientation.rotate(point).add(s.position)};
 }
 return best;
}
