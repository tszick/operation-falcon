// Screen quadrilaterals registered to the blank 1672 x 941 cockpit asset.
export const FRAME={width:1672,height:941,top:540};
export const screenWells={
 weapons:[[81,718],[435,667],[481,829],[98,893]],
 radar:[[590,596],[891,594],[899,846],[579,848]],
 engine:[[979,597],[1133,597],[1133,704],[979,705]],
 mission:[[981,760],[1185,760],[1191,877],[984,878]],
 controls:[[1326,623],[1587,644],[1565,758],[1305,732]],
 // Inset from the glass edges, preserving their different top/bottom slopes.
 guide:[[1310,781],[1614,820],[1603,923],[1291,872]]
};
// Each engraved switch plate has its own perspective, independent of the whole console.
export const controlWells={
 'config-gear':[[1329,630],[1389,636],[1384,667],[1324,661]],
 'config-flaps':[[1427,639],[1480,645],[1477,677],[1423,671]],
 'config-airbrake':[[1520,648],[1580,655],[1576,686],[1515,680]],
 'config-assist':[[1321,692],[1379,698],[1375,731],[1317,724]],
 'config-afterburner':[[1420,702],[1473,708],[1469,740],[1415,734]],
 'config-wheel-brake':[[1513,712],[1574,719],[1570,751],[1507,744]]
};
export function cockpitHeight(width,height){
 // The engine well sits below the raised central lip; keep the lower HUD clear.
 const hudFloor=height*.53+(height<650?112:177);
 const frontInset=(screenWells.engine[0][1]-FRAME.top)/(FRAME.height-FRAME.top);
 return Math.min(height*.30,Math.max(height*.18,(height-hudFloor)/(1-frontInset)));
}
export function cockpitHudFooterY(width,height){return Math.min(height*.53+(height<650?80:145),height-cockpitHeight(width,height)-24);}
export function wellQuad(name,width,height){return screenWells[name].map(([x,y])=>[x/FRAME.width*width,(y-FRAME.top)/(FRAME.height-FRAME.top)*height]);}
export function homography(width,height,points){
 const source=[[0,0],[width,0],[width,height],[0,height]],rows=[];
 source.forEach(([x,y],i)=>{const [u,v]=points[i];rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);});
 for(let col=0;col<8;col++){
  let pivot=col;for(let row=col+1;row<8;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
  [rows[col],rows[pivot]]=[rows[pivot],rows[col]];const div=rows[col][col];if(Math.abs(div)<1e-9)throw new Error('Degenerate cockpit screen');
  for(let k=col;k<=8;k++)rows[col][k]/=div;
  for(let row=0;row<8;row++)if(row!==col){const f=rows[row][col];for(let k=col;k<=8;k++)rows[row][k]-=f*rows[col][k];}
 }
 return rows.map(r=>r[8]);
}
export function matrix3d(h){return [h[0],h[3],0,h[6],h[1],h[4],0,h[7],0,0,1,0,h[2],h[5],0,1];}
export function compactObjective(row){
 const labels={return:'Hazatérés',bridge:'Híd lezárása',convoy:'Konvoj',enemyBase:'Reptér',landing:'Leszállás','civil-lock':'Befogás','civil-exit':'Távozás',transport:'Szállító',enemies:'Ellenség',main:'Elsődleges feladat'};
 if(row.id==='city')return row.text.split(' · ')[0];
 if(row.id==='waves')return row.text.replace(' · támadók ',' · ');
 if(row.id==='ballistic')return row.done?'Csapás elhárítva':row.text.includes('Rakéta')?'RAKÉTA A LEVEGŐBEN':'SILÓ '+(row.text.match(/\d+:\d{2}/)?.[0]||'');
 if(row.id==='attackers')return row.text.replace(/^Támadók:\s*/,'');
 return labels[row.id]||(row.id==='base'?row.text.replace('Saját reptér:','Bázis:'):row.text);
}
