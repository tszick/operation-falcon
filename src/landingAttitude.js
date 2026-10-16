import {attitude,DEG,clamp} from './math.js';
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a))/DEG;
const signed=n=>`${n>=0?'+':''}${n.toFixed(1)}°`;
export function landingAttitude(s){
 if(!s.approach?.active||s.onGround||s.crashed||s.dying)return null;
 const a=attitude(s.orientation),desired=s.approach.direction>0?0:Math.PI;
 const heading=wrap(a.heading-desired),track=Math.hypot(s.velocity.x,s.velocity.z)>1?wrap(Math.atan2(s.velocity.x,s.velocity.z)-desired):null;
 const pitch=a.pitch/DEG,bank=a.bank/DEG;
 // Match the simulator's touchdown envelope; descent angle is a separate measurement.
 const nose=pitch<=-3?'ORR TÚL LENT':pitch>=15?'ORR TÚL MAGASAN':pitch<0?'ORR LEFELÉ':'ORRHELYZET RENDBEN';
 return {heading,track,pitch,bank,nose,noseOK:pitch>-3&&pitch<15,bankOK:Math.abs(bank)<10,headingOK:Math.abs(heading)<8,trackOK:track!==null&&Math.abs(track)<8,descent:s.approach.angle,runway:s.approach.direction>0?'000':'180'};
}
export function landingAttitudeMarkup(s){
 const a=landingAttitude(s);if(!a)return '';
 const color=ok=>ok?'#baf37d':'#f6b77a';
 return `<strong>LESZÁLLÁSI HELYZET</strong><div class="landing-angles"><svg viewBox="0 0 78 70" role="img" aria-label="Pályához viszonyított orrirány és haladási irány"><path class="landing-runway" d="M32 5H46V49H32Z M39 7V13 M39 18V25 M39 30V37 M39 42V47"/><path d="M39 65V19" fill="none" stroke="#73cde1" stroke-dasharray="3 3" transform="rotate(${clamp(a.track??0,-85,85)} 39 65)"/><path d="M39 37L43 50L56 57V60L42 57L41 65H37L36 57L22 60V57L35 50Z" fill="#12271b" stroke="${color(a.headingOK)}" transform="rotate(${clamp(a.heading,-85,85)} 39 65)"/></svg><div><span>PÁLYA ${a.runway}°</span><b style="color:${color(a.headingOK)}">ORR ${signed(a.heading)}</b><small style="color:${color(a.trackOK)}">IRÁNY ${a.track===null?'—':signed(a.track)}</small></div></div><div class="landing-pitch"><svg viewBox="0 0 94 42" role="img" aria-label="Orrhelyzet: ${signed(a.pitch)}"><path d="M3 25H91" stroke="#829579" stroke-dasharray="3 3"/><path d="M8 23L28 23L45 15L53 15L43 23L75 23L85 26L75 29L24 29L13 33L9 33L14 27Z" fill="#12271b" stroke="${color(a.noseOK)}" transform="rotate(${-clamp(a.pitch,-30,30)} 47 25)"/></svg><div style="color:${color(a.noseOK)}"><b>${signed(a.pitch)}</b><small>${a.nose}</small></div></div><div class="landing-bank"><span style="color:${color(a.bankOK)}">BEDÖNTÉS ${signed(a.bank)}</span><span>SIKLÁS ${a.descent.toFixed(1)}° / 3°</span></div>`;
}
