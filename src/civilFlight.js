import {clamp} from './math.js';
export const civilAirspaceRadius=11000;
export function beginCivilDeparture(t){if(!t?.civilian||!t.alive||t.withdrawing||t.departedAirspace)return false;t.withdrawing=true;t.exitHeading=t.heading+Math.PI;t.turnComplete=false;return true;}
export function updateCivilFlight(t,dt){
 if(t.withdrawing){const error=Math.atan2(Math.sin(t.exitHeading-t.heading),Math.cos(t.exitHeading-t.heading)),turn=clamp(error,-.045*dt,.045*dt),speed=t.cruiseSpeed||120;t.heading+=turn;if(Math.abs(error)<.01)t.turnComplete=true;t.velocity.x=Math.sin(t.heading)*speed;t.velocity.z=Math.cos(t.heading)*speed;const bank=Math.atan(speed*(dt>0?turn/dt:0)/9.81);t.bank=(t.bank||0)+clamp(bank-(t.bank||0),-.3*dt,.3*dt);}
 t.position.add(t.velocity.clone().scale(dt));
 if(t.withdrawing&&t.turnComplete&&Math.hypot(t.position.x,t.position.z)>(t.airspaceRadius||civilAirspaceRadius)){t.departedAirspace=true;t.alive=false;t.withdrawing=false;}
}
