// The switch arms the afterburner; the throttle must enter its operating range.
export const afterburnerActive=s=>!!(s.afterburner&&s.spec.hasAB&&s.throttle>.8&&s.fuel>0);
export function afterburnerStatus(s){
 if(!s.spec.hasAB)return {active:false,label:'UTÁNÉG.',message:'EHHEZ A GÉPHEZ NINCS UTÁNÉGETŐ'};
 if(!s.afterburner)return {active:false,label:'UTÁNÉG.',message:'UTÁNÉGETŐ KI'};
 if(s.fuel<=0)return {active:false,label:'AB NINCS',message:'UTÁNÉGETŐ NEM MŰKÖDIK · NINCS ÜZEMANYAG'};
 if(!afterburnerActive(s))return {active:false,label:'AB KÉSZ',message:'UTÁNÉGETŐ ELŐKÉSZÍTVE · R: GÁZ 80% FÖLÉ'};
 return {active:true,label:'UTÁNÉG.',message:'UTÁNÉGETŐ AKTÍV'};
}
