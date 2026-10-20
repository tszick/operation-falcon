import {Vec3,clamp,DEG} from './math.js';

// Hand-built, low-poly recognition models in metres (+Z nose, +Y up).
// Each type has its own planform; these are visual approximations, not CAD replicas.
export const airframes={
 harrier:{length:14.12,body:.83,wing:[[.9,1.4],[4.625,-.65],[4.3,-2.1],[.85,-2]],tail:[[.6,-4.3],[2.65,-5.6],[2.35,-6.5],[.6,-5.8]],fins:1,finHeight:2.8,finStart:-3.8,finEnd:-6.5,engines:1,engineRadius:.5,engineFront:.7,engineBack:-3.9,canopy:3.1,canopyLength:2.4,intakes:'side',rails:true,harrier:true},
 t45:{length:11.98,body:.64,wing:[[.65,1.5],[4.695,-.7],[4.5,-2.1],[.65,-2.2]],tail:[[.55,-3.25],[2.4,-4.6],[2.15,-5.4],[.55,-4.8]],fins:1,finHeight:2.5,finStart:-2.8,finEnd:-5.3,engines:1,engineRadius:.46,engineFront:-.8,engineBack:-5.65,canopy:2.1,canopyLength:3.6,intakes:'side'},
 airliner:{engineMount:'wing',length:37,body:1.7,wing:[[1.5,2.4],[17,-3.7],[16.6,-5.3],[1.5,-2.1]],wingY:-.7,tail:[[1.2,-11.5],[6.3,-15.6],[5.9,-17],[1.1,-14.8]],fins:1,finHeight:5.8,finStart:-10.9,finEnd:-17.6,engines:2,engineX:5.6,engineY:-1.8,engineRadius:.95,engineFront:.6,engineBack:-3.8,canopy:14.5,canopyLength:1.6,canopyWidth:1.1,noseBlunt:true,cabinWindows:true},
 f22:{length:18.9,body:1.42,wing:[[1.1,3.2],[6.78,-.8],[6.1,-3.7],[2,-4.8]],tail:[[1.5,-5],[4.8,-7.9],[3.5,-8.8],[1.2,-7]],fins:2,finX:2.0,finHeight:3.0,finCant:1.1,finStart:-4.5,finEnd:-8.3,engines:2,engineX:.86,engineRadius:.66,engineFront:1.8,engineBack:-8.9,canopy:3.9,canopyLength:3.2,canopyWidth:.62,intakes:'box',faceted:true,nozzle:'flat',bays:[[-1.1,.5],[1.1,.5]],bodyHeight:.64},
 f35:{length:15.67,body:1.25,wing:[[1.0,1.7],[5.35,-1.2],[4.7,-3.3],[1.4,-3.7]],tail:[[1,-4.1],[3.4,-6.1],[2.4,-7.1],[.9,-6]],fins:2,finX:1.38,finHeight:2.5,finCant:.9,finStart:-3.3,finEnd:-6.9,engines:1,engineRadius:.84,engineFront:-1.3,engineBack:-7.25,canopy:3.1,canopyLength:2.8,canopyWidth:.61,intakes:'side',faceted:true,bays:[[-.85,.3],[.85,.3]],bodyHeight:.92},
 su35:{length:21.9,body:.96,wing:[[.9,5.1],[2.25,2.6],[7.35,-2],[7.2,-4.9],[1.6,-5.5]],tail:[[1.4,-6.3],[4.6,-8.6],[4.05,-10.2],[1.4,-9.3]],fins:2,finX:2.05,finHeight:3.5,finStart:-5.1,finEnd:-9.5,engines:2,engineX:1.4,engineRadius:.76,engineFront:1.9,engineBack:-10.1,canopy:4.9,canopyLength:3.4,lerx:6.7,intakes:'box',stinger:true,rails:true},
 su57:{length:20.1,body:1.65,wing:[[1.2,4.4],[2.5,2.3],[7.05,-1.7],[6.6,-4.0],[2,-5.1]],tail:[[1.7,-5],[4.6,-7.7],[3.8,-9.3],[1.5,-7.9]],fins:2,finX:2.5,finHeight:2.15,finCant:.8,finStart:-5.7,finEnd:-9.1,engines:2,engineX:1.65,engineRadius:.70,engineFront:1.4,engineBack:-9.4,canopy:4.7,canopyLength:3.2,canopyWidth:.64,lerx:6.5,intakes:'box',faceted:true,bays:[[0,2.0],[0,-2.4]],bodyHeight:.58},
 j10:{length:16.9,body:.8,wing:[[.8,2.0],[4.87,-2.6],[4.6,-4.4],[.85,-4.3]],canard:[[.7,4.0],[2.55,2.5],[2.1,1.5],[.7,2.4]],fins:1,finHeight:3.2,finStart:-3.6,finEnd:-7.7,engines:1,engineRadius:.68,engineFront:-1,engineBack:-8.0,canopy:3.9,canopyLength:2.8,intakes:'chin',ventralFins:true},
 j20:{length:20.4,body:1.2,wing:[[1,2.3],[6.75,-3.4],[6.35,-5.2],[1.3,-5.8]],canard:[[1.05,5.9],[3.6,3.8],[3.2,2.55],[1,3.65]],fins:2,finX:2.15,finHeight:2.65,finCant:1.0,finStart:-5.3,finEnd:-9.1,engines:2,engineX:.94,engineRadius:.69,engineFront:.8,engineBack:-9.7,canopy:5.1,canopyLength:3,canopyWidth:.66,intakes:'side',faceted:true,bays:[[0,.5]],ventralFins:true,bodyHeight:.7},
 f14:{length:19.1,body:1.05,wing:[[1.7,2.8],[3.2,2.4],[9.77,-2.2],[9.2,-3.5],[3.2,-2.5],[1.8,-3.4]],tail:[[1.4,-5.4],[4.2,-7.8],[3.9,-9.1],[1.2,-8.2]],fins:2,finX:2.05,finHeight:3.4,finStart:-4.5,finEnd:-8.7,engines:2,engineX:1.45,engineRadius:.72,engineFront:1.6,engineBack:-8.7,canopy:3.2,canopyLength:4.2,sweep:true,intakes:'box',glove:true},
 f15:{length:19.4,body:1.12,wing:[[1.3,3.3],[6.53,-.8],[6.45,-3.1],[2.2,-3.4]],tail:[[1.5,-5.1],[4.2,-7.6],[3.9,-9.2],[1.3,-8]],fins:2,finX:1.9,finHeight:3.5,finStart:-4.7,finEnd:-8.9,engines:2,engineX:.95,engineRadius:.7,engineFront:2.4,engineBack:-9.1,canopy:3.7,canopyLength:3.5,intakes:'box'},
 f16:{length:15.0,body:.75,wing:[[.8,2.2],[4.7,-.8],[4.65,-2.6],[1,-3]],tail:[[.65,-4.3],[2.7,-6.0],[2.5,-7.0],[.6,-6.1]],fins:1,finHeight:3.05,finStart:-3.7,finEnd:-6.9,engines:1,engineRadius:.65,engineFront:-1,engineBack:-7.15,canopy:2.6,canopyLength:2.7,intakes:'chin',rails:true},
 fa18:{length:17.1,body:.82,wing:[[.9,3.7],[1.8,2],[5.65,-.5],[5.55,-3],[1.4,-3.8]],tail:[[1.05,-4.9],[3.5,-6.6],[3.1,-7.9],[1,-7.1]],fins:2,finX:1.45,finHeight:2.8,finCant:.8,finStart:-3.8,finEnd:-7.6,engines:2,engineX:.73,engineRadius:.53,engineFront:.7,engineBack:-8.1,canopy:3.2,canopyLength:3,lerx:4.7,intakes:'box',rails:true},
 mirage:{length:14.36,body:.77,wing:[[.72,3.6],[4.55,-3.8],[4.2,-4.5],[.8,-4.7]],fins:1,finHeight:3.0,finStart:-3.0,finEnd:-6.2,engines:1,engineRadius:.67,engineFront:-2,engineBack:-6.9,canopy:2.6,canopyLength:2.1,intakes:'side'},
 rafale:{length:15.3,body:.82,wing:[[.85,2.1],[5.4,-3.4],[4.9,-4.8],[.9,-4.5]],canard:[[.75,3.2],[2.4,2.3],[2.35,1.5],[.75,1.6]],fins:1,finHeight:3.3,finStart:-3,finEnd:-6.7,engines:2,engineX:.6,engineRadius:.49,engineFront:-.7,engineBack:-7.2,canopy:3.3,canopyLength:2.8,intakes:'side',rails:true},
 euro:{length:15.96,body:.84,wing:[[.8,2.6],[5.48,-3.4],[5.05,-4.9],[.9,-4.4]],canard:[[.7,4.2],[2.65,3.0],[2.35,2.1],[.7,2.7]],fins:1,finHeight:3.6,finStart:-3.2,finEnd:-7,engines:2,engineX:.63,engineRadius:.51,engineFront:-.7,engineBack:-7.6,canopy:3.4,canopyLength:2.6,intakes:'chin'},
 gripen:{length:14.1,body:.68,wing:[[.7,1.45],[4.2,-2.8],[4.1,-4],[.7,-3.7]],canard:[[.6,3.3],[2.2,2.55],[2.0,1.4],[.6,1.8]],fins:1,finHeight:3,finStart:-2.9,finEnd:-6.1,engines:1,engineRadius:.61,engineFront:-1,engineBack:-6.7,canopy:2.8,canopyLength:2.3,intakes:'side',rails:true},
 f4:{length:19.2,body:1.05,wing:[[1,2],[3.8,.1],[5.85,-2.1],[5.55,-4],[1.1,-4.4]],wingTipRise:.7,tail:[[.9,-5.8],[3.65,-7.8],[3.35,-9],[.8,-8.2]],tailDrop:-.7,fins:1,finHeight:3.2,finStart:-4.9,finEnd:-8.9,engines:2,engineX:.71,engineRadius:.57,engineFront:2.9,engineBack:-8.4,canopy:3,canopyLength:4.5,intakes:'box',noseDroop:.35},
 f15e:{length:19.4,body:1.2,wing:[[1.3,3.3],[6.53,-.8],[6.45,-3.1],[2.2,-3.4]],tail:[[1.5,-5.1],[4.2,-7.6],[3.9,-9.2],[1.3,-8]],fins:2,finX:1.9,finHeight:3.5,finStart:-4.7,finEnd:-8.9,engines:2,engineX:.95,engineRadius:.7,engineFront:2.4,engineBack:-9.1,canopy:3.1,canopyLength:4.6,intakes:'box',tanks:true},
 tornado:{length:16.7,body:1,wing:[[1.3,1.7],[2.4,1.4],[6.95,-2.3],[6.5,-3.6],[1.5,-3.3]],tail:[[1,-4.9],[3.1,-6.4],[2.9,-7.7],[.8,-7]],fins:1,finHeight:4,finStart:-3.5,finEnd:-7.5,engines:2,engineX:.65,engineRadius:.58,engineFront:1,engineBack:-7.9,canopy:2.6,canopyLength:3.7,sweep:true,intakes:'box'},
 a10:{length:16.26,body:.87,wing:[[.8,1.5],[8.77,.6],[8.7,-1.8],[.8,-2.2]],tail:[[.65,-5.6],[3.3,-5.8],[3.3,-7.2],[.65,-7.5]],fins:2,finX:3.1,finHeight:2.15,finStart:-5.1,finEnd:-7.1,engines:2,engineX:1.7,engineY:1.3,engineRadius:.94,engineFront:-2.6,engineBack:-6.5,canopy:5.3,canopyLength:2.35,noseBlunt:true,gun:true,pylons:true},
 mig25:{length:23.8,body:1.2,wing:[[1.4,2.7],[7.03,-1.4],[6.65,-4.4],[1.4,-4.8]],tail:[[1.5,-6.9],[4.35,-9.1],[3.9,-11],[1.4,-10]],fins:2,finX:2.25,finHeight:3.8,finStart:-6.1,finEnd:-10.5,engines:2,engineX:1.15,engineRadius:.94,engineFront:3.2,engineBack:-10.9,canopy:4.9,canopyLength:2.4,intakes:'box',slab:true},
 mig31:{length:22.7,body:1.25,wing:[[1.4,3.2],[6.73,-1.8],[6.45,-4.1],[1.5,-4.8]],tail:[[1.5,-6.5],[4.35,-8.8],[3.9,-10.5],[1.4,-9.8]],fins:2,finX:2.15,finHeight:3.6,finStart:-6.1,finEnd:-10.2,engines:2,engineX:1.08,engineRadius:.9,engineFront:3,engineBack:-10.6,canopy:4.2,canopyLength:4.2,intakes:'box',slab:true},
 su27:{length:21.94,body:.91,wing:[[.8,5],[2.1,2.5],[7.35,-2.0],[7.25,-4.9],[1.6,-5.4]],tail:[[1.4,-6.5],[4.5,-8.6],[4,-10.2],[1.4,-9.3]],fins:2,finX:2.0,finHeight:3.8,finStart:-5.1,finEnd:-9.5,engines:2,engineX:1.38,engineRadius:.72,engineFront:1.8,engineBack:-10.1,canopy:4.8,canopyLength:3.5,lerx:6.6,intakes:'box',stinger:true,rails:true},
 mig29:{length:17.32,body:.85,wing:[[.8,3.7],[1.9,1.8],[5.68,-1.7],[5.2,-3.4],[1.5,-4.1]],tail:[[1,-4.9],[3.65,-6.4],[3.25,-7.9],[.9,-7]],fins:2,finX:1.45,finHeight:3.0,finCant:.3,finStart:-3.7,finEnd:-7.4,engines:2,engineX:.97,engineRadius:.62,engineFront:1.5,engineBack:-8.0,canopy:3.5,canopyLength:2.7,lerx:4.8,intakes:'box'},
 su24:{length:22.5,body:1.3,wing:[[1.5,2.4],[2.7,2.1],[8.8,-2.6],[8.3,-4.1],[1.5,-4.6]],tail:[[1.4,-7],[4.2,-8.9],[3.8,-10.7],[1.2,-9.9]],fins:1,finHeight:4,finStart:-6.4,finEnd:-10.5,engines:2,engineX:.85,engineRadius:.69,engineFront:1.6,engineBack:-10.7,canopy:4.4,canopyLength:3.1,canopyWidth:1.2,sweep:true,intakes:'box'},
 mig27:{length:17.1,body:.87,wing:[[1.1,1.7],[2.4,1.5],[6.98,-1.9],[6.6,-3.4],[1.2,-3.3]],tail:[[.8,-4.9],[3.1,-6.5],[2.9,-7.9],[.7,-7.3]],fins:1,finHeight:3.4,finStart:-3.9,finEnd:-7.7,engines:1,engineRadius:.75,engineFront:-1,engineBack:-8.1,canopy:3,canopyLength:2.2,sweep:true,intakes:'box',noseDroop:.9},
 su25:{length:15.53,body:.9,wing:[[.85,2],[7.18,-.6],[6.9,-2.8],[.9,-2.5]],tail:[[.7,-4.4],[2.6,-5.9],[2.4,-7.1],[.6,-6.5]],fins:1,finHeight:3,finStart:-3.7,finEnd:-6.9,engines:2,engineX:1.1,engineRadius:.58,engineFront:1.6,engineBack:-5.5,canopy:4.4,canopyLength:2.4,noseBlunt:true,pylons:true,intakes:'side'},
 tu95:{engineMount:'wing',length:46.2,body:1.3,wing:[[1.2,5.1],[25,-6.5],[24,-9.4],[1.3,-1.4]],tail:[[1,-14],[8.8,-18.4],[8.3,-20],[1,-17]],fins:1,finHeight:7,finStart:-13,finEnd:-21,engines:4,engineXs:[8,16],engineRadius:1.1,engineFront:1.8,engineBack:-7.5,canopy:17,canopyLength:2.5,propellers:true},
 b52:{engineMount:'wing',length:48.5,body:1.8,wing:[[1.8,6],[28.2,-12.3],[27.3,-15],[1.7,-2]],tail:[[1.4,-15],[8,-21],[7.4,-22.6],[1.1,-19]],fins:1,finHeight:7.4,finStart:-13.2,finEnd:-22.5,engines:8,engineXs:[10,12.5,19,21.5],engineY:-2,engineRadius:.8,engineFront:-3,engineBack:-8,canopy:17,canopyLength:3,noseBlunt:true},
 il76:{engineMount:'wing',length:46.6,body:2.2,wing:[[1.8,5],[25.2,-7.5],[24.8,-10],[1.8,-2.6]],wingY:1.6,tail:[[.8,-16],[10.5,-19],[9.5,-21],[.8,-18]],tailY:7,fins:1,finHeight:7.6,finStart:-13.9,finEnd:-22,engines:4,engineXs:[8,15],engineY:-.3,engineRadius:1.3,engineFront:2,engineBack:-5,canopy:17.5,canopyLength:2.4,noseBlunt:true},
 c130:{engineMount:'wing',length:29.8,body:1.7,wing:[[1.5,2.8],[20.2,1.6],[20.0,-1],[1.5,-1.4]],wingY:1.2,tail:[[1,-9],[7.7,-11],[7.3,-13],[1,-12]],tailY:1.1,fins:1,finHeight:6.3,finStart:-8.5,finEnd:-14,engines:4,engineXs:[7,13],engineY:.2,engineRadius:.75,engineFront:5,engineBack:-1,canopy:10,canopyLength:2,noseBlunt:true,propellers:true}
};

class MeshBuilder{
 constructor(){this.points=[];this.edges=[];this.faces=[];this.details=[];}
 point(p){this.points.push(new Vec3(...p));return this.points.length-1;}
 face(coords){const ids=coords.map(p=>this.point(p));this.faces.push(ids);for(let i=0;i<ids.length;i++)this.edges.push([ids[i],ids[(i+1)%ids.length]]);return ids;}
 line(a,b){const edge=[this.point(a),this.point(b)];this.edges.push(edge);this.details.push(edge);}
 tube(stations,segments=8){const rings=stations.map(([z,rx,ry,cy=0,cx=0])=>Array.from({length:segments},(_,i)=>this.point([cx+Math.cos(i/segments*Math.PI*2)*rx,cy+Math.sin(i/segments*Math.PI*2)*ry,z])));this.faces.push(rings[0]);for(let j=0;j<rings.length-1;j++)for(let i=0;i<segments;i++){const k=(i+1)%segments,a=rings[j][i],b=rings[j][k],c=rings[j+1][k],d=rings[j+1][i];this.faces.push([a,b,c,d]);this.edges.push([a,b],[a,d]);}this.faces.push([...rings.at(-1)].reverse());for(let i=0;i<segments;i++)this.edges.push([rings.at(-1)[i],rings.at(-1)[(i+1)%segments]]);}
 surface(outline,y=0,rise=0){const sides=[];for(const sign of[-1,1]){const max=Math.max(...outline.map(p=>p[0]));sides.push(this.face(outline.map(([x,z])=>[x*sign,y+rise*(x/max)**3,z])));}return sides;}
}
airframes.c130j={...airframes.c130,propellerBlades:6};
airframes.il76md90a={...airframes.il76,engineRadius:1.48,engineFront:2.3};
airframes.y20={...airframes.il76,length:47,body:2.55,tailY:7.5,finHeight:8.2,wing:[[2,5.5],[25,-6],[24.5,-9],[2,-2]],engineXs:[8.2,15.8],engineRadius:1.35,canopy:18};
const cache=new Map();
function wingSection(wing,x){const zs=[];for(let i=0;i<wing.length;i++){const a=wing[i],b=wing[(i+1)%wing.length];if(Math.abs(b[0]-a[0])<1e-8){if(Math.abs(x-a[0])<1e-7)zs.push(a[1],b[1]);continue;}const t=(x-a[0])/(b[0]-a[0]);if(t>=-1e-7&&t<=1+1e-7)zs.push(a[1]+t*(b[1]-a[1]));}return zs.length?{rear:Math.min(...zs),front:Math.max(...zs)}:null;}
export function aircraftMesh(id='f16',sweep=0,flaps=0){
 if(typeof id==='object')id=id.id;
 if(!airframes[id])id=({delta:'mirage',twin:'mig29',straight:'a10',swept:'f14'})[id]||'f16';
 const p=airframes[id],amount=p.sweep?clamp(sweep,0,1):0,flapStep=Math.round(clamp(flaps,0,1)*20),key=id+':'+Math.round(amount*20)+':'+flapStep;
 if(cache.has(key))return cache.get(key);
 const b=new MeshBuilder(),L=p.length/2,W=p.body,tags=new Map(),engineFaces=new Map(),attachments={left:[],right:[]};
 const height=p.bodyHeight||W*.82;
 b.tube([[L,p.noseBlunt?W*.35:.025,p.noseBlunt?W*.3:.03,-(p.noseDroop||0)],[L*(p.noseBlunt?.87:.73),W*(p.noseBlunt?.85:.53),height*.76],[L*.35,W,height],[0,W*1.08,height],[-L*.5,W*.9,height*.83],[-L*.93,W*.55,height*.55],[-L,W*.15,height*.22]],8);
 const wing=p.wing.map(([x,z])=>{const pivot=2.0;if(!p.sweep||x<=pivot)return[x,z];const angle=amount*38*DEG,dx=x-pivot;return[pivot+dx*Math.cos(angle),z-dx*Math.sin(angle)];});
 const wingFaces=b.surface(wing,p.wingY||0,p.wingTipRise||0);tags.set(wingFaces[0],'leftWing');tags.set(wingFaces[1],'rightWing');
 const span=Math.max(...wing.map(v=>v[0])),angle=flapStep/20*30*DEG,flapFaces=[];
 const flapPoint=(x,z)=>{const section=wingSection(wing,Math.abs(x)),hinge=section.rear+(section.front-section.rear)*.28,offset=Math.max(0,hinge-z);return [x,(p.wingY||0)+(p.wingTipRise||0)*(Math.abs(x)/span)**3-offset*Math.sin(angle)-.015,hinge-offset*Math.cos(angle)];};
 if(flapStep)for(const face of wingFaces)for(const index of face){const v=b.points[index],section=wingSection(wing,Math.abs(v.x));if(section&&v.z<section.rear+(section.front-section.rear)*.28){const coords=flapPoint(v.x,v.z);v.y=coords[1];v.z=coords[2];}}
 for(const sign of[-1,1]){const inner=span*.30,outer=span*.72,a=wingSection(wing,inner),c=wingSection(wing,outer);if(!a||!c)continue;const hingeA=a.rear+(a.front-a.rear)*.28,hingeC=c.rear+(c.front-c.rear)*.28,face=b.face([flapPoint(sign*inner,hingeA),flapPoint(sign*outer,hingeC),flapPoint(sign*outer,c.rear),flapPoint(sign*inner,a.rear)]);flapFaces.push(face);tags.set(face,sign<0?'leftWing':'rightWing');}
 if(p.tail)for(const face of b.surface(p.tail,p.tailY||.3,p.tailDrop||0))tags.set(face,'tail');
 if(p.canard)b.surface(p.canard,.4);
 if(p.faceted)b.surface([[W*.45,L*.72],[W*1.28,L*.33],[W*1.32,-L*.38],[W*.5,-L*.65]],.2);
 if(p.ventralFins)for(const sign of[-1,1])b.face([[sign*1.1,-.3,-L*.58],[sign*1.7,-1.6,-L*.85],[sign*1.1,-.4,-L*.94]]);
 if(p.bays)for(const[x,z]of p.bays){const y=-height*.98;b.face([[x-.42,y,z+1.5],[x+.42,y,z+1.5],[x+.42,y,z-1.5],[x-.42,y,z-1.5]]);}
 if(p.lerx)b.surface([[W*.5,p.lerx],[W*1.5,p.lerx*.65],[W*2.1,1],[W,0]],.4);
 if(p.glove)b.surface([[W,4],[3.2,2.3],[3.3,-2.8],[W,-4]],.15);
 const canopyWidth=p.canopyWidth||W*.62,z=p.canopy,cl=p.canopyLength;
 b.tube([[z+cl/2,.04,.05,W*.65],[z+cl*.2,canopyWidth,W*.7,W*.9],[z-cl*.3,canopyWidth*.85,W*.6,W*.9],[z-cl/2,.1,.08,W*.72]],6);
 // Frames distinguish tandem cockpits without a dense wire cage.
 if(cl>3.5)b.line([-canopyWidth,W,z],[canopyWidth,W,z]);
 if(p.cabinWindows)for(const sign of[-1,1])for(let z=-10;z<12;z+=1.15)b.line([sign*W,.65,z],[sign*W,.65,z+.45]);
 for(const sign of p.fins===2?[-1,1]:[0]){const x=(p.finX||0)*sign,h=p.finHeight,cant=(p.finCant||0)*sign;tags.set(b.face([[x,.45,p.finStart],[x+cant,h,p.finStart-1.7],[x+cant*.85,h*.91,p.finEnd+.7],[x,.5,p.finEnd]]),'tail');}
 const engineXs=p.engines===1?[0]:p.engineXs?p.engineXs.flatMap(x=>[-x,x]):[-p.engineX,p.engineX];
 for(const [engineIndex,x] of (p.harrier?[]:engineXs).entries()){const pointStart=b.points.length,r=p.engineRadius,y=p.engineY??-.25,front=p.engineFront,back=p.engineBack,startFace=b.faces.length;b.tube([[front,r*.86,r*.86,y,x],[front-.7,r,r,y,x],[back+.5,r*.9,r*.9,y,x],[back,r*.8,r*.8,y,x]],10);for(let i=startFace;i<b.faces.length;i++)tags.set(b.faces[i],x<=0?'engineLeft':'engineRight');
   if(p.nozzle==='flat')b.face([[x-r,y+.3,back-.25],[x+r,y+.3,back-.25],[x+r,y-.3,back-.25],[x-r,y-.3,back-.25]]);
   if(p.intakes==='box')for(const sign of[-1,1]){if(Math.sign(x)!==sign&&p.engines>1)continue;const ix=p.engines===1?sign*(W+.3):x;b.face([[ix-r,y+r,front],[ix+r,y+r,front],[ix+r,y-r,front],[ix-r,y-r,front]]);}
   if(p.propellers){const rad=r*2.8;for(let i=0;i<(p.propellerBlades||4);i++){const a=i*2*Math.PI/(p.propellerBlades||4)+.3,dx=Math.cos(a)*rad,dy=Math.sin(a)*rad;b.face([[x-.18,y,front+.12],[x+dx-.12,y+dy,front+.12],[x+dx+.12,y+dy,front+.12],[x+.18,y,front+.12]]);}}
   for(let i=startFace;i<b.faces.length;i++){tags.set(b.faces[i],x<=0?'engineLeft':'engineRight');engineFaces.set(b.faces[i],engineIndex);}
   if(p.engineMount==='wing')for(let i=pointStart;i<b.points.length;i++)attachments[x<0?'left':'right'].push(i);
 }
 if(p.intakes==='chin')b.tube([[L*.24,.58,.36,-W*.9],[L*.08,.64,.4,-W*.9],[-L*.3,.45,.28,-W*.7]],8);
 if(p.intakes==='side')for(const sign of[-1,1])b.tube([[L*.25,.31,.48,-.05,sign*(W+.1)],[L*.03,.42,.5,-.05,sign*W]],8);
 if(p.harrier)for(const sign of[-1,1])for(const z of[.3,-2.2]){const start=b.faces.length;b.tube([[z+.2,.23,.23,-.3,sign*.9],[z-.3,.25,.25,-.6,sign*1.02]],6);for(let i=start;i<b.faces.length;i++){tags.set(b.faces[i],'engineLeft');engineFaces.set(b.faces[i],0);}}
 if(p.stinger)b.tube([[-L*.68,.32,.3,0],[-L*1.07,.12,.12,0]],6);
 if(p.gun)b.tube([[L+.25,.1,.1,-.4,-.18],[L-.5,.1,.1,-.4,-.18]],6);
 if(p.rails){const outer=wing.reduce((a,v)=>v[0]>a[0]?v:a);for(const sign of[-1,1]){const start=b.points.length;b.tube([[outer[1]+.6,.09,.09,0,sign*outer[0]],[outer[1]-1.1,.09,.09,0,sign*outer[0]]],4);for(let i=start;i<b.points.length;i++)attachments[sign<0?'left':'right'].push(i);}}
 if(p.pylons)for(const sign of[-1,1])for(const x of[2.5,4.5,6]){const face=b.face([[sign*x,0,0],[sign*x,-.5,-.2],[sign*x,-.5,-1.1],[sign*x,0,-1.3]]);attachments[sign<0?'left':'right'].push(...face);tags.set(face,sign<0?'leftWing':'rightWing');}
 if(p.tanks)for(const sign of[-1,1])b.tube([[2,.15,.2,-.9,sign*1.1],[0,.5,.5,-.9,sign*1.1],[-4,.2,.2,-.9,sign*1.1]],6);
 const mesh={...b,id,flapFaces,flapFraction:flapStep/20,faceParts:b.faces.map(face=>tags.get(face)||'fuselage'),faceEngines:b.faces.map(face=>engineFaces.get(face)??null),wingPoints:{left:[...wingFaces[0],...(flapFaces[0]||[]),...attachments.left],right:[...wingFaces[1],...(flapFaces[1]||[]),...attachments.right]},radius:Math.max(...b.points.map(p=>p.length()))};cache.set(key,mesh);return mesh;
}


