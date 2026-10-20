import {clamp} from './math.js';
// Approximate installed engine-family TSFC [kg / (N s)], not certified charts.
// Thrust in aircraftSpec is the sum for all engines; never multiply it twice.
const families={
 harrier:[.000027,0],t45:[.000024,0],c130:[.000011,0],il76:[.000021,0],b52:[.000022,0],tu95:[.000012,0],airliner:[.000017,0],
 f14:[.000025,.000064],f15:[.000021,.000056],f16:[.000021,.000057],fa18:[.000023,.000059],mirage:[.000026,.000062],
 rafale:[.000021,.000052],euro:[.000020,.000051],gripen:[.000021,.000055],f4:[.000031,.000073],f15e:[.000021,.000056],tornado:[.000023,.000060],a10:[.000011,0],
 mig25:[.000034,.000079],mig31:[.000024,.000061],su27:[.000025,.000064],mig29:[.000026,.000066],su24:[.000030,.000072],mig27:[.000028,.000069],su25:[.000029,0],
 f22:[.000019,.000050],f35:[.000019,.000052],su35:[.000023,.000058],su57:[.000022,.000056],j10:[.000022,.000057],j20:[.000022,.000056]
};
export function fuelFlow(s,{thrust=0,afterburner=false,mach=s.mach||0,density=1.225,engine=1}={}){
 if(s.fuel<=0||s.crashed||s.dying||engine<=0)return 0;
 const [dry,wet]=families[s.spec.id]||[.000025,.000065],tsfc=afterburner&&s.spec.hasAB?wet:dry;
 const lapse=clamp(density/1.225,.23,1),ramFactor=clamp(1-(s.velocity?.length()||0)/(s.spec.maxMach*340)*.22,.4,1);
 const engineThrust=Math.max(s.spec.thrust*.065*lapse*engine,thrust/ramFactor);
 // High Mach operation increases installed fuel cost; mass and stores enter
 // through the aircraft lift/drag/thrust demand, not a second fuel multiplier.
 return engineThrust*tsfc*(1+.12*clamp(mach,0,3)**2);
}
export function consumeFuel(s,flow,dt){const consumed=Math.min(Math.max(0,s.fuel),Math.max(0,flow)*dt);s.fuel=Math.max(0,s.fuel-consumed);s.fuelFlow=dt>0?consumed/dt:0;if(s.fuel===0){s.afterburner=false;s.enginePower=0;}return consumed;}
