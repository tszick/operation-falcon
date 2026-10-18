// Pointer lock supplies relative motion even when the invisible cursor would
// have reached a screen edge. Cursor coordinates never steer the pilot's head.
export class HeadLookInput {
 constructor(surface,head,doc,{canLook,onEscape=()=>{},onChange=()=>{}}){Object.assign(this,{surface,head,doc,canLook,onEscape,onChange});this.wanted=false;this.wasLocked=false;this.pending=false;this.fallback=false;}
 get locked(){return this.doc.pointerLockElement===this.surface;}
 capture(){
  if(!this.canLook())return;this.wanted=true;this.head.reset();if(this.locked||this.pending)return;
  if(typeof this.surface.requestPointerLock!=='function'){this.fallback=true;return;}
  this.pending=true;
  try{const request=this.surface.requestPointerLock();Promise.resolve(request).catch(()=>this.failed()).finally(()=>{this.pending=false;});}catch{this.pending=false;this.failed();}
 }
 failed(){if(this.wanted&&this.canLook())this.fallback=true;}
 release(){this.wanted=false;this.fallback=false;this.head.reset();if(this.locked)this.doc.exitPointerLock?.();}
 changed(){
  const locked=this.locked,previous=this.wasLocked;this.wasLocked=locked;this.head.reset();this.onChange(locked);
  if(locked){this.pending=false;this.fallback=false;if(!this.wanted||!this.canLook())this.release();}
  else if(previous&&this.wanted){this.wanted=false;this.onEscape();}
 }
 move(event,now){
  if(!this.canLook()||!this.wanted||(!this.locked&&!this.fallback))return;
  if(!this.locked&&event.target?.closest?.('button,a,input,select,#cockpit,#phase-guide,#flight-message-feed'))return;
  this.head.move(event.movementX,event.movementY,now);
 }
}
