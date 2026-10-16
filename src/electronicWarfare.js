// Combined radar/GNSS denial is an explicit game rule, not a universal EW model.
import {teamOf} from './unitTypes.js';
export const jammerMissions=new Set(['airbase']);
export const activeJammers=targets=>targets.filter(t=>t.alive&&t.type==='jammer');
export function navigationJammed(s,targets){return activeJammers(targets).some(t=>teamOf(t,s)==='enemy'&&t.position.distance(s.position)<t.jamRadius);}
// Outside denial zones every hostile object is selectable; the player chooses the order.
export function targetMasked(){return false;}
export function visibleTargets(s,targets){return navigationJammed(s,targets)?[]:targets.filter(t=>t.alive);}
export function targetSelectable(t,s){return !!t.alive&&teamOf(t,s)!=='ally';}
export function sensorTargets(s,targets){return visibleTargets(s,targets).filter(t=>targetSelectable(t,s,targets));}
