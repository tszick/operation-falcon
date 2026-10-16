import {navigationJammed} from './electronicWarfare.js';
import {attitude,DEG} from './math.js';
import {radarContacts} from './targeting.js';
import {terrainHeight,runway,terrainWorld,pathPoint,pathCoordinates} from './terrain.js';
export function tacticalMapState(s,targets){
 const contacts=radarContacts(s,targets).filter(c=>c.visible&&!c.target.home);
 const base=s.approach?.active?10000:30000;
 const reach=Math.max(Math.abs(s.position.x),Math.abs(s.position.z),...contacts.flatMap(c=>[Math.abs(c.target.position.x),Math.abs(c.target.position.z)]));
 const halfExtent=base*2**Math.max(0,Math.ceil(Math.log2(Math.max(1,reach/(base*.85)))));
 const scale=108/halfExtent;
 return {halfExtent,scale,jammed:navigationJammed(s,targets),contacts:contacts.map(c=>({...c,motionHeading:Math.hypot(c.target.velocity.x,c.target.velocity.z)>1?Math.atan2(c.target.velocity.x,c.target.velocity.z):c.target.heading||0})),playerHeading:Math.hypot(s.velocity.x,s.velocity.z)>3?Math.atan2(s.velocity.x,s.velocity.z):attitude(s.orientation).heading};
}
export const mapPoint=(p,map)=>({x:120+p.x*map.scale,y:120-p.z*map.scale});
let contourCache=null,contourExtent=0,contourRevision=-1;
function contours(extent){
 if(contourCache&&extent===contourExtent&&contourRevision===terrainWorld.revision)return contourCache;
 const canvas=document.createElement('canvas');canvas.width=240;canvas.height=240;const c=canvas.getContext('2d'),n=56,h=[];c.strokeStyle='#35523b';c.lineWidth=.6;
 for(let z=0;z<=n;z++){h[z]=[];for(let x=0;x<=n;x++)h[z][x]=terrainHeight((x/n-.5)*extent*2,(.5-z/n)*extent*2);}
 for(let level=100;level<3000;level+=150){c.beginPath();for(let z=0;z<n;z++)for(let x=0;x<n;x++){
  const corners=[[x,z,h[z][x]],[x+1,z,h[z][x+1]],[x+1,z+1,h[z+1][x+1]],[x,z+1,h[z+1][x]]],pts=[];
  for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4];if((a[2]<level)!==(b[2]<level)){const t=(level-a[2])/(b[2]-a[2]);pts.push([(a[0]+(b[0]-a[0])*t)*240/n,(a[1]+(b[1]-a[1])*t)*240/n]);}}
  for(let i=0;i+1<pts.length;i+=2){c.moveTo(...pts[i]);c.lineTo(...pts[i+1]);}
 }c.stroke();}
 contourCache=canvas;contourExtent=extent;contourRevision=terrainWorld.revision;return canvas;
}
function glyph(c,p,heading,color,air=true){c.save();c.translate(p.x,p.y);c.rotate(heading);c.strokeStyle=color;c.fillStyle=color;c.lineWidth=1;
 c.beginPath();if(air){c.moveTo(0,-7);c.lineTo(4.5,5);c.lineTo(0,2);c.lineTo(-4.5,5);c.closePath();c.fill();c.beginPath();c.moveTo(0,-7);c.lineTo(0,-14);c.stroke();}else{c.strokeRect(-3,-3,6,6);c.beginPath();c.moveTo(0,-3);c.lineTo(0,-12);c.lineTo(-3,-8);c.moveTo(0,-12);c.lineTo(3,-8);c.stroke();}c.restore();}
export function renderTacticalMap(canvas,s,targets,aim){
 const map=tacticalMapState(s,targets),c=canvas.getContext('2d');c.clearRect(0,0,240,240);if(map.jammed){renderRadarNoise(c,s.elapsed);return map;}c.fillStyle='#0a1712';c.fillRect(0,0,240,240);c.drawImage(contours(map.halfExtent),0,0);renderMapRoutes(c,map);
 c.save();c.beginPath();c.rect(7,7,226,226);c.clip();c.strokeStyle='#497144';c.lineWidth=.7;for(const radius of[36,72,108]){c.beginPath();c.arc(120,120,radius,0,Math.PI*2);c.stroke();}
 c.beginPath();c.moveTo(120,0);c.lineTo(120,240);c.moveTo(0,120);c.lineTo(240,120);c.stroke();
 c.strokeStyle='#9fc37388';c.setLineDash([3,4]);c.beginPath();const approach=13000*map.scale;c.moveTo(120,120-approach);c.lineTo(120,120+approach);c.stroke();c.setLineDash([]);
 c.strokeStyle='#d1efa8';c.strokeRect(118.5,120-runway.halfLength*map.scale,3,runway.halfLength*2*map.scale);
 c.fillStyle='#a9c88d';c.font='9px Consolas,monospace';c.fillText('N',124,13);c.fillText('BASE',126,132);c.fillText('000°',125,120-approach+9);c.fillText('180°',125,120+approach-3);
 const own=mapPoint(s.position,map),heading=attitude(s.orientation).heading,range=Math.min(100,s.spec.radarRange*map.scale),cone=s.spec.radarCone*DEG;
 c.save();c.translate(own.x,own.y);c.rotate(heading);c.strokeStyle='#b0e18444';c.beginPath();c.moveTo(0,0);c.arc(0,0,range,-Math.PI/2-cone,-Math.PI/2+cone);c.closePath();c.stroke();c.restore();
 for(const contact of map.contacts){const point=mapPoint(contact.target.position,map);glyph(c,point,contact.motionHeading,contact.target.team==='ally'?'#82c6e5':contact.target.civilian?'#9cdce4':'#f2b482',contact.target.kind==='air');if(contact.target.id===aim.id){c.strokeStyle=contact.target.civilian?'#bce9ee':'#f6d5a3';c.strokeRect(point.x-9,point.y-9,18,18);}}
 glyph(c,own,map.playerHeading,'#c3f18e');c.restore();
 return map;
}

export function renderRadarNoise(c,time=0){c.fillStyle='#080808';c.fillRect(0,0,240,240);let seed=(Math.floor(time*20)+1)*7919;for(let y=0;y<240;y+=4)for(let x=0;x<240;x+=4){seed=(Math.imul(seed,1664525)+1013904223)|0;const gray=seed>>>24;c.fillStyle=`rgb(${gray},${gray},${gray})`;c.fillRect(x,y,4,4);}c.fillStyle='#000b';c.fillRect(15,103,210,33);c.fillStyle='#fff';c.font='bold 10px Consolas,monospace';c.textAlign='center';c.fillText('JELZAVARÁS · NAV / RADAR',120,123);c.textAlign='left';}

function renderMapRoutes(c,map){
 for(const kind of ['river','road']){const path=terrainWorld[kind];if(!path)continue;
  const draw=()=>{c.beginPath();let started=false;for(let t=-90000;t<=90000;t+=300){const p=pathPoint(path,t),wet=kind==='road'&&terrainWorld.river&&!terrainWorld.bridge&&Math.abs(pathCoordinates(terrainWorld.river,p.x,p.z).across)<terrainWorld.river.width*.5+15;if(kind==='road'&&(path.min!==undefined?t<path.min||t>path.max:Math.hypot(p.x,p.z)<4500)||wet){started=false;continue;}const v=mapPoint(p,map);if(started)c.lineTo(v.x,v.y);else c.moveTo(v.x,v.y);started=true;}c.stroke();};
  c.strokeStyle=kind==='river'?'#579ba8':'#17201c';c.lineWidth=kind==='river'?Math.max(1,path.width*map.scale):3;draw();
  if(kind==='road'){c.strokeStyle='#d0bd88';c.lineWidth=1;draw();}
 }
 c.fillStyle='#d0bd88';c.font='8px Consolas,monospace';if(terrainWorld.road)c.fillText('━ ÚT',9,231);if(terrainWorld.river){c.fillStyle='#72b3be';c.fillText('~ FOLYÓ',66,231);}
}
