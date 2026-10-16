import {clamp} from './math.js';
import {actuatorFault} from './damage.js';
export function flapStatus(s){const fraction=clamp(s.flapPosition??(s.flaps?1:0),0,1),moving=Math.abs((s.flaps?1:0)-fraction)>.02,jammed=moving&&!!actuatorFault(s,'flaps'),percent=Math.round(fraction*100);return {fraction,percent,moving,jammed,deployed:s.flaps&&fraction>.95,retracted:!s.flaps&&fraction<.05,label:jammed?`BESZORULT ${percent}%`:moving?`${s.flaps?'NYÍLIK':'BEHÚZÁS'} ${percent}%`:fraction>.95?'KINN':'BENN'};}
