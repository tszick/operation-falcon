import {Vec3} from './math.js';
// Schematic recognition shapes; these do not claim exact manufacturer geometry.
export function weaponPreviewMesh(entry){
 const points=[],faces=[],details=[];
 const point=(x,y,z)=>{points.push(new Vec3(x,y,z));return points.length-1;};
 function tube(x,y,r,length){const rings=[];for(const z of [-length/2,length/2]){const ring=[];for(let i=0;i<8;i++){const a=i*Math.PI/4;ring.push(point(x+r*Math.cos(a),y+r*Math.sin(a),z));}rings.push(ring);}for(let i=0;i<8;i++)faces.push([rings[0][i],rings[0][(i+1)%8],rings[1][(i+1)%8],rings[1][i]]);faces.push([...rings[0]].reverse(),rings[1]);return rings;}
 if(entry.type==='gun'){tube(0,0,1.3,3);for(let i=0;i<6;i++){const a=i*Math.PI/3;tube(Math.cos(a)*.8,Math.sin(a)*.8,.25,10);}}
 else if(entry.kind==='countermeasure'){tube(0,0,1.2,4);for(let i=0;i<12;i++){const a=i*2.4,r=2+i*.16,z=-3-i*.35,x=Math.cos(a)*r,y=Math.sin(a)*r;faces.push([point(x,y,z),point(x+.3,y+.4,z-.5),point(x-.2,y+.15,z-.7)]);}}
 else{const bomb=entry.type==='bomb',r=bomb?1.2:.65;const rings=tube(0,0,r,10),tip=point(0,0,7);for(let i=0;i<8;i++)faces.push([rings[1][i],rings[1][(i+1)%8],tip]);for(let i=0;i<4;i++){const a=i*Math.PI/2,x=Math.cos(a),y=Math.sin(a);faces.push([point(x*r,y*r,-4.5),point(x*2.6,y*2.6,-5.3),point(x*2.4,y*2.4,-2),point(x*r,y*r,-.8)]);}}
 return {points,faces,details,radius:9};
}
