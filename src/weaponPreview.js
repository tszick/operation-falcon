import {Vec3} from './math.js';
// Schematic recognition shapes; these do not claim exact manufacturer geometry.
export function weaponPreviewMesh(entry){
 const points=[],faces=[],details=[];
 const point=(x,y,z)=>{points.push(new Vec3(x,y,z));return points.length-1;};
 function tube(x,y,r,length){const rings=[];for(const z of [-length/2,length/2]){const ring=[];for(let i=0;i<8;i++){const a=i*Math.PI/4;ring.push(point(x+r*Math.cos(a),y+r*Math.sin(a),z));}rings.push(ring);}for(let i=0;i<8;i++)faces.push([rings[0][i],rings[0][(i+1)%8],rings[1][(i+1)%8],rings[1][i]]);faces.push([...rings[0]].reverse(),rings[1]);return rings;}
 if(entry.id==='weapon-searam'){
  const box=(x,y,z,w,h,d)=>{const ids=[[-w,-h,-d],[w,-h,-d],[w,-h,d],[-w,-h,d],[-w,h,-d],[w,h,-d],[w,h,d],[-w,h,d]].map(v=>point(x+v[0],y+v[1],z+v[2]));for(const f of [[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7],[0,3,2,1]])faces.push(f.map(i=>ids[i]));};
  box(0,-2.4,0,3,0.5,2);box(0,-1.4,0,1,0.6,1);box(0,0,0,3.5,1.6,1.5);
  for(let row=0;row<2;row++)for(let i=0;i<(row?5:6);i++)tube((i-(row?2:2.5))*1.05,row?0.7:-0.5,.42,4);
  box(3.5,0.4,0,0.5,0.6,0.7);
 }
 else if(entry.type==='gun'){tube(0,0,1.3,3);for(let i=0;i<6;i++){const a=i*Math.PI/3;tube(Math.cos(a)*.8,Math.sin(a)*.8,.25,10);}}
 else if(entry.kind==='countermeasure'){tube(0,0,1.2,4);for(let i=0;i<12;i++){const a=i*2.4,r=2+i*.16,z=-3-i*.35,x=Math.cos(a)*r,y=Math.sin(a)*r;faces.push([point(x,y,z),point(x+.3,y+.4,z-.5),point(x-.2,y+.15,z-.7)]);}}
 else{const bomb=entry.type==='bomb',r=bomb?1.2:.65;const rings=tube(0,0,r,10),tip=point(0,0,7);for(let i=0;i<8;i++)faces.push([rings[1][i],rings[1][(i+1)%8],tip]);for(let i=0;i<4;i++){const a=i*Math.PI/2,x=Math.cos(a),y=Math.sin(a);faces.push([point(x*r,y*r,-4.5),point(x*2.6,y*2.6,-5.3),point(x*2.4,y*2.4,-2),point(x*r,y*r,-.8)]);}}
 return {points,faces,details,radius:9};
}
