import {aircraft} from './aircraftSpec.js';
import {aiAircraft} from './heavyAircraftData.js';
export {aiAircraft};
export function aircraftFlightSpec(id){const spec=aircraft.find(s=>s.id===id)||aiAircraft.find(s=>s.id===id);if(!spec)throw new Error(`Missing aircraft physics: ${id}`);return spec;}
