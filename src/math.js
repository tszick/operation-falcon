export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const DEG=Math.PI/180;
export class Vec3 {
 constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
 clone(){return new Vec3(this.x,this.y,this.z);}
 add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
 sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
 scale(s){this.x*=s;this.y*=s;this.z*=s;return this;}
 dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;}
 cross(v){return new Vec3(this.y*v.z-this.z*v.y,this.z*v.x-this.x*v.z,this.x*v.y-this.y*v.x);}
 length(){return Math.hypot(this.x,this.y,this.z);}
 normalize(){return this.scale(1/(this.length()||1));}
 distance(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
}
export class Quat {
 constructor(x=0,y=0,z=0,w=1){Object.assign(this,{x,y,z,w});}
 clone(){return new Quat(this.x,this.y,this.z,this.w);}
 multiply(q){const {x,y,z,w}=this;this.x=w*q.x+x*q.w+y*q.z-z*q.y;this.y=w*q.y-x*q.z+y*q.w+z*q.x;this.z=w*q.z+x*q.y-y*q.x+z*q.w;this.w=w*q.w-x*q.x-y*q.y-z*q.z;return this;}
 normalize(){const n=Math.hypot(this.x,this.y,this.z,this.w)||1;this.x/=n;this.y/=n;this.z/=n;this.w/=n;return this;}
 rotate(v){const q=new Vec3(this.x,this.y,this.z),t=q.cross(v).scale(2);return v.clone().add(t.clone().scale(this.w)).add(q.cross(t));}
 static axis(v,a){const s=Math.sin(a/2);return new Quat(v.x*s,v.y*s,v.z*s,Math.cos(a/2));}
 static euler(h,p,b){return Quat.axis(new Vec3(0,1,0),h).multiply(Quat.axis(new Vec3(1,0,0),-p)).multiply(Quat.axis(new Vec3(0,0,1),-b));}
}
export const forward=q=>q.rotate(new Vec3(0,0,1));
export const up=q=>q.rotate(new Vec3(0,1,0));
export const right=q=>q.rotate(new Vec3(1,0,0));
export function attitude(q){const f=forward(q),r=right(q),u=up(q);return {heading:Math.atan2(f.x,f.z),pitch:Math.asin(clamp(f.y,-1,1)),bank:Math.atan2(-r.y,u.y)};}
