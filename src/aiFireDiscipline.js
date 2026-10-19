// Tactical choice inside the ordinary launch envelope, shared by both sides.
// The first shot may use the outer envelope; preserve the latter half of a
// finite load for a closer engagement instead of spending everything on approach.
export function aiMissileDecision(unit,solution){
 if(unit.missiles<=0)return {allow:false,reason:'empty'};
 if(!solution.canLaunch)return {allow:false,reason:solution.status};
 const initial=unit.initialMissiles??unit.missiles,reserve=Math.floor(initial/2),closeRange=Math.min(8000,(solution.effectiveRange??solution.maxRange??0)*.65);
 const holding=unit.missiles<=reserve&&solution.distance>closeRange;
 return {allow:!holding,reason:holding?'reserve-close-range':'ready',reserve,closeRange};
}
