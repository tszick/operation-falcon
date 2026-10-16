import {Vec3,Quat} from './math.js';
import {terrainWorld,terrainHeight,convoyPose} from './terrain.js';
class Builder {
 constructor(){this.points=[];this.faces=[];this.details=[];}
 face(pts){const ids=pts.map(p=>{this.points.push(new Vec3(...p));return this.points.length-1;});this.faces.push(ids);return ids;}
 line(a,b){this.details.push([this.points.push(new Vec3(...a))-1,this.points.push(new Vec3(...b))-1]);}
 box(x,y,z,w,h,d){const p=[[-w,0,-d],[w,0,-d],[w,0,d],[-w,0,d],[-w,h,-d],[w,h,-d],[w,h,d],[-w,h,d]].map(v=>[v[0]+x,v[1]+y,v[2]+z]);for(const ids of [[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]])this.face(ids.map(i=>p[i]));}
 rings(x,z,rings,n=16){let prev=null;for(const [y,r]of rings){const ids=[];for(let i=0;i<n;i++){const a=i/n*Math.PI*2;ids.push(this.points.push(new Vec3(x+Math.cos(a)*r,y,z+Math.sin(a)*r))-1);}if(prev)for(let i=0;i<n;i++)this.faces.push([prev[i],prev[(i+1)%n],ids[(i+1)%n],ids[i]]);prev=ids;}this.faces.push(prev);}
 wheel(x,y,z){const start=this.points.length;for(const dx of [-.35,.35])for(let i=0;i<10;i++){const a=i/10*Math.PI*2;this.points.push(new Vec3(x+dx,y+Math.cos(a)*.85,z+Math.sin(a)*.85));}for(let i=0;i<10;i++)this.faces.push([start+i,start+(i+1)%10,start+10+(i+1)%10,start+10+i]);}
 truck(x=0,z=0,covered=true){this.box(x,1,z,1.5,1,5.6);this.box(x,2,z+3.7,1.55,2.7,1.7);this.face([[x-1.3,3.4,z+5.42],[x+1.3,3.4,z+5.42],[x+1.3,4.4,z+5.42],[x-1.3,4.4,z+5.42]]);this.box(x,2,z-1.8,1.6,covered?3.3:1.3,3.6);for(const dx of [-1.65,1.65])for(const dz of [-4,-1.8,3.5])this.wheel(x+dx,1,z+dz);}
 dish(x,y,z){this.line([x,0,z],[x,y,z]);const n=16,r=6;for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;this.face([[x,y,z+1],[x+Math.cos(a)*r,y+Math.sin(a)*r,z-1],[x+Math.cos(b)*r,y+Math.sin(b)*r,z-1]]);}this.line([x,y,z+1],[x,y,z-5]);for(const dx of [-5,5])this.line([x+dx,y,z-1],[x,y,z-5]);}
 finish(){const bounds={};for(const axis of ['x','y','z']){const v=this.points.map(p=>p[axis]);bounds[axis]=[Math.min(...v),Math.max(...v)];}return {points:this.points,faces:this.faces,details:this.details,bounds,radius:Math.max(...this.points.map(p=>p.length()))};}
}
const cache=new Map();
export function groundMesh(type,span=220){const key=type+':'+Math.round(span);if(cache.has(key))return cache.get(key);const b=new Builder();
 if(type==='convoy'){for(let i=-2;i<=2;i++)b.truck(0,i*30);}
 else if(type==='truck')b.truck();
 else if(type==='bunker'){b.rings(0,0,[[0,27],[5,29],[6,37],[9,35],[13,25],[15,8]],24);b.box(0,0,27,7,5,5);b.box(0,6,29,13,.7,1);for(let a=0;a<6;a++){const q=a*Math.PI/3;b.line([Math.cos(q)*29,6,Math.sin(q)*29],[Math.cos(q)*32,8,Math.sin(q)*32]);}}
 else if(type==='jammer'){b.truck(0,0);for(const x of [-2,2]){b.line([x,2,-3],[x,24,-3]);for(let y=10;y<24;y+=3)b.line([x-3,y,-3],[x+3,y,-3]);}b.box(0,7,-3,4,5,1);b.dish(7,13,-5);b.box(-7,0,-7,2.5,3,3);}
 else if(type==='sam-system'){b.truck(-8,0,false);b.rings(7,-2,[[0,2.5],[2,2.5],[2,1],[18,1],[21,0]],12);for(const d of [-1,1]){b.face([[7,2,-2],[7+d*3,2,-2],[7,8,-2]]);b.face([[7,2,-2],[7,2,-2+d*3],[7,8,-2]]);}b.box(7,0,-2,4,.8,4);b.line([-7,3,-1],[7,1,-2]);}
 else if(type==='sam'){b.box(0,0,0,4,1.4,5);b.rings(0,0,[[1.4,3],[3,3],[4,2]],12);for(const x of [-1.3,-.45,.45,1.3]){b.face([[x-.16,4,0],[x+.16,4,0],[x+.16,12,9],[x-.16,12,9]]);}for(const x of [-5,5])for(const z of [-4,4]){b.wheel(x,1,z);b.line([0,1,0],[x,1,z]);}b.box(-3,2,-2,1,3,1);b.dish(4,7,-3);}
 else if(type==='bridge'){const half=span*.5;b.box(0,0,0,10,2,half);for(const x of [-10,10]){b.line([x,4,-half],[x,4,half]);for(let z=-half;z<half;z+=25){b.line([x,2,z],[x,4,z]);b.line([x,4,z],[x,2,Math.min(half,z+25)]);}}for(const z of [-half*.65,0,half*.65])b.box(0,-18,z,7,18,3);}
 else if(type==='airbase'){b.box(0,-1,0,30,1,360);for(let z=-340;z<350;z+=40)b.line([0,.1,z],[0,.1,z+20]);for(const z of [-170,-70,30]){b.box(85,0,z,28,15,32);b.face([[57,15,z-32],[85,23,z-32],[113,15,z-32]]);b.face([[57,15,z-32],[85,23,z-32],[85,23,z+32],[57,15,z+32]]);b.face([[85,23,z-32],[113,15,z-32],[113,15,z+32],[85,23,z+32]]);}b.box(75,0,150,8,26,8);b.box(75,26,150,13,6,12);b.dish(75,38,150);b.truck(60,220);}
 else b.box(0,0,0,15,10,15);
 const mesh=b.finish();cache.set(key,mesh);return mesh;
}
export function groundInstances(t){
 if(t.type==='convoy')return [-2,-1,0,1,2].map(i=>({...convoyPose(t,i*30),mesh:groundMesh('truck')}));
 const mesh=groundMesh(t.type,t.type==='bridge'?(terrainWorld.river?.width||180)+70:220),position=t.position.clone();
 if(t.type!=='bridge')position.y=terrainHeight(position.x,position.z)+.5;
 return [{position,heading:t.heading||0,mesh}];
}
export function renderGroundTarget(renderer,t){for(const instance of groundInstances(t))renderer.mesh(instance.mesh,instance.position,Quat.euler(instance.heading,0,0),1,t.team==='ally'?'#8dbed4':t.type==='jammer'?'#e7c994':'#c4aa88');}
export function groundHit(t,from,to,padding=0){
 // Swept local boxes follow the exact rendered instances, including each truck.
 for(const {position,heading,mesh}of groundInstances(t)){
  const inverse=Quat.euler(-heading,0,0),a=inverse.rotate(from.clone().sub(position)),b=inverse.rotate(to.clone().sub(position)),d=b.clone().sub(a);let enter=0,exit=1;
  for(const axis of ['x','y','z']){const lo=mesh.bounds[axis][0]-padding,hi=mesh.bounds[axis][1]+padding;if(Math.abs(d[axis])<1e-9){if(a[axis]<lo||a[axis]>hi){enter=2;break;}}else{let p=(lo-a[axis])/d[axis],q=(hi-a[axis])/d[axis];if(p>q)[p,q]=[q,p];enter=Math.max(enter,p);exit=Math.min(exit,q);}}
  if(enter<=exit&&enter<=1&&exit>=0)return true;
 }return false;
}
