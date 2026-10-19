import {renderTacticalMap,tacticalMapState,mapPoint,mapZoomLevel} from './tacticalMap.js';
import {missionCardState,missionGoalsMarkup} from './flightPanels.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numbers=['','One','Two','Three','Four'];
export function missionControlSnapshot(s,m,targets,aim,{width=700,height=560,zoom=1}={}){
 const map=tacticalMapState(s,targets,{width,height,zoom}),card=missionCardState(s,m,targets);
 const contacts=map.contacts.map(c=>{const t=c.target,p=mapPoint(t.position,map),label=t.displayCallSign||(t.radioCallSign?`${t.radioCallSign.flight} ${numbers[t.radioCallSign.number]||t.radioCallSign.number}`:t.name||t.type);return {id:t.id,label,distance:c.distance,position:p,selected:t.id===aim.id,color:t.team==='ally'?'#82c6e5':t.civilian?'#9cdce4':'#f2b482',team:t.civilian?'neutral':t.team||'enemy'};}).filter(c=>c.position.x>=8&&c.position.x<width-8&&c.position.y>=8&&c.position.y<height-8);
 return {map,card,contacts,elapsed:s.elapsed,zoom:map.zoom};
}
export class MissionControlView {
 constructor(doc=document){this.doc=doc;this.root=doc.getElementById('mission-control-view');this.canvas=doc.getElementById('mission-control-map');this.zoom=1;this.args=null;}
 show(s,m,targets,aim){this.args={s,m,targets,aim};this.zoom=mapZoomLevel(s.mapZoom);this.root.hidden=false;this.draw();}
 draw(){if(this.root.hidden||!this.args)return;const {s,m,targets,aim}=this.args,$=id=>this.doc.getElementById(id),box=this.canvas.getBoundingClientRect();this.canvas.width=Math.max(240,Math.round(box.width));this.canvas.height=Math.max(200,Math.round(box.height));
  const options={width:this.canvas.width,height:this.canvas.height,zoom:this.zoom},snapshot=missionControlSnapshot(s,m,targets,aim,options),map=renderTacticalMap(this.canvas,s,targets,aim,options);
  $('control-mission-name').textContent=snapshot.card.name;$('control-phase').textContent=snapshot.card.phase+' · '+snapshot.card.elapsed;
  $('control-objectives').innerHTML=missionGoalsMarkup(snapshot.card);$('control-map-zoom').textContent=`0 · NAGYÍTÁS ${map.zoomFactor}×`;
  $('control-map-range').textContent=map.jammed?'JELZAVARÁS · NAV / RADAR NEM ELÉRHETŐ':`${map.halfExtent*2/1000} KM · ${snapshot.contacts.length} ÉSZLELT EGYSÉG`;
  $('control-contacts').innerHTML=map.jammed?'<li>Nincs érzékelőadat a zavarási zónában.</li>':snapshot.contacts.map(t=>`<li style="color:${t.color}"><span>${esc(t.label)}</span><b>${(t.distance/1000).toFixed(1)} km</b></li>`).join('')||'<li>Nincs érzékelt egység ebben a térképkivágásban.</li>';
  if(!map.jammed)this.labels(snapshot,s);
 }
 labels(snapshot,s){const c=this.canvas.getContext('2d'),map=snapshot.map,rects=[];c.save();c.beginPath();c.rect(8,8,map.width-16,map.height-16);c.clip();c.font='12px Consolas,monospace';
  const own=mapPoint(s.position,map),ownLabel='FALCON ONE · SAJÁT GÉP',ownWidth=c.measureText(ownLabel).width,ownX=Math.min(Math.max(10,own.x+10),map.width-ownWidth-10),ownY=Math.max(24,own.y-10);c.fillStyle='#c3f18e';c.fillText(ownLabel,ownX,ownY);rects.push({x:ownX,y:ownY-12,w:ownWidth});
  for(const contact of [...snapshot.contacts].sort((a,b)=>Number(b.selected)-Number(a.selected))){const text=`${contact.label} · ${(contact.distance/1000).toFixed(1)} km`,w=c.measureText(text).width,x=Math.max(10,Math.min(map.width-w-10,contact.position.x+10));let y=null;
   for(const offset of [-10,20,-26,36,-42,52]){const candidate=Math.max(24,Math.min(map.height-28,contact.position.y+offset));if(!rects.some(r=>x<r.x+r.w&&x+w>r.x&&candidate-12<r.y+14&&candidate>r.y)){y=candidate;break;}}
   if(y===null)continue;rects.push({x,y:y-12,w});c.fillStyle=contact.color;c.fillText(text,x,y);
  }c.restore();
 }
 hide(){this.root.hidden=true;this.args=null;}
}
