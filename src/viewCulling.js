// Conservative camera-frustum rejection before expensive terrain visibility rays.
// A segment is rejected only when both ends lie outside the same view plane.
export function segmentInView(r,a,b,padding=4){
 const p=r.local(a),q=r.local(b),x=(r.w*.5+padding)/r.focal,top=(r.h*.53+padding)/r.focal,bottom=(r.h*.47+padding)/r.focal;
 return ![[p.z-1,q.z-1],[p.x+p.z*x,q.x+q.z*x],[p.z*x-p.x,q.z*x-q.x],[p.z*top-p.y,q.z*top-q.y],[p.y+p.z*bottom,q.y+q.z*bottom]].some(([a,b])=>a<0&&b<0);
}
export function projectedInView(r,p,padding=150){return !!p&&p.x>=-padding&&p.x<=r.w+padding&&p.y>=-padding&&p.y<=r.h+padding;}
