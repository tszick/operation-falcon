import {forward} from './math.js';
export function radarContact(source,target){
 const range=source.spec?.radarRange||0,delta=target.position.clone().sub(source.position),distance=delta.length();if(distance>=range)return false;
 return !source.orientation||forward(source.orientation).dot(delta.scale(1/Math.max(1e-12,distance)))>Math.cos((source.spec.radarCone??60)*Math.PI/180);
}
