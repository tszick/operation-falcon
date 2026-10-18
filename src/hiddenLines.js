// Hide model edges behind any opaque face of the same model. Coordinates are
// projected pixels; inverse depth is affine on a perspective-projected plane.
const cross=(a,b)=>a.x*b.y-a.y*b.x;
function inside(p,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
function facePlane(poly,value){
 const a=poly[0];for(let i=1;i<poly.length-1;i++){const b=poly[i],c=poly[i+1],u={x:b.x-a.x,y:b.y-a.y},v={x:c.x-a.x,y:c.y-a.y},det=cross(u,v);if(Math.abs(det)<1e-10)continue;
 const qb=value(b)-value(a),qc=value(c)-value(a),x=(qb*v.y-qc*u.y)/det,y=(u.x*qc-v.x*qb)/det;return {x,y,c:value(a)-x*a.x-y*a.y};}return null;
}
export function visibleMeshEdges(screen,faces,details=[],{perspective=true,minLength=0,spatial=true}={}){
 const value=p=>perspective?1/p.depth:-p.depth;
 const prepared=faces.filter(ids=>ids.every(i=>screen[i])).map(ids=>{const poly=ids.map(i=>screen[i]);return {poly,plane:facePlane(poly,value),xmin:Math.min(...poly.map(p=>p.x)),xmax:Math.max(...poly.map(p=>p.x)),ymin:Math.min(...poly.map(p=>p.y)),ymax:Math.max(...poly.map(p=>p.y))};}).filter(f=>f.plane);
 // Exact broad phase: only faces in screen tiles touched by an edge can hide it.
 const tile=16,grid=new Map(),large=[];if(spatial&&prepared.length>24)for(const f of prepared){const x0=Math.floor(f.xmin/tile),x1=Math.floor(f.xmax/tile),y0=Math.floor(f.ymin/tile),y1=Math.floor(f.ymax/tile);if((x1-x0+1)*(y1-y0+1)>1024){large.push(f);continue;}for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const key=x+':'+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(f);}}
 const edges=[...faces.flatMap(ids=>ids.map((id,i)=>[id,ids[(i+1)%ids.length]])),...details],result=[],seen=new Set();
 for(const [ai,bi]of edges){const a=screen[ai],b=screen[bi];if(!a||!b||Math.hypot(b.x-a.x,b.y-a.y)<minLength)continue;const token=[`${a.x},${a.y},${a.depth}`,`${b.x},${b.y},${b.depth}`].sort().join('|');if(seen.has(token))continue;seen.add(token);
  const d={x:b.x-a.x,y:b.y-a.y},qa=value(a),dq=value(b)-qa,ts=[0,1];
  const xmin=Math.min(a.x,b.x),xmax=Math.max(a.x,b.x),ymin=Math.min(a.y,b.y),ymax=Math.max(a.y,b.y);let pool=prepared;
  if(grid.size){const x0=Math.floor(xmin/tile),x1=Math.floor(xmax/tile),y0=Math.floor(ymin/tile),y1=Math.floor(ymax/tile);if((x1-x0+1)*(y1-y0+1)<1024){const nearby=new Set(large);for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)for(const f of grid.get(x+':'+y)||[])nearby.add(f);pool=[...nearby];}}
  const candidates=pool.filter(f=>f.xmax>=xmin&&f.xmin<=xmax&&f.ymax>=ymin&&f.ymin<=ymax);
  for(const f of candidates){for(let i=0;i<f.poly.length;i++){const c=f.poly[i],e=f.poly[(i+1)%f.poly.length],v={x:e.x-c.x,y:e.y-c.y},offset={x:c.x-a.x,y:c.y-a.y},det=cross(d,v);if(Math.abs(det)<1e-10)continue;const t=cross(offset,v)/det,u=cross(offset,d)/det;if(t>0&&t<1&&u>=0&&u<=1)ts.push(t);}
   const q0=f.plane.x*a.x+f.plane.y*a.y+f.plane.c-qa,qD=f.plane.x*d.x+f.plane.y*d.y-dq;if(Math.abs(qD)>1e-12){const t=-q0/qD;if(t>0&&t<1)ts.push(t);}
  }
  ts.sort((a,b)=>a-b);const at=t=>({x:a.x+d.x*t,y:a.y+d.y*t,...(a.color?{color:a.color}:{})});
  for(let i=1;i<ts.length;i++){const lo=ts[i-1],hi=ts[i];if(hi-lo<1e-7)continue;const t=(lo+hi)/2,p=at(t),q=qa+dq*t,tolerance=Math.max(1e-10,Math.abs(q)*1e-6);
   if(!candidates.some(f=>p.x>=f.xmin&&p.x<=f.xmax&&p.y>=f.ymin&&p.y<=f.ymax&&inside(p,f.poly)&&f.plane.x*p.x+f.plane.y*p.y+f.plane.c>q+tolerance))result.push([at(lo),at(hi)]);
  }
 }
 return result;
}
