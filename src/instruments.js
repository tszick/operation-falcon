import {clamp} from './math.js';
export function fuelStatus(s){
  const ratio=clamp(s.fuel/Math.max(1,s.spec.fuelCapacity),0,1);
  const percent=Math.round(ratio*100);
  const level=ratio===0?'empty':ratio<.1?'critical':ratio<.25?'low':'normal';
  const flowKgMin=Math.max(0,s.fuelFlow||0)*60;
  return {percent,kg:Math.max(0,Math.round(s.fuel)),level,flowKgMin,minutesRemaining:flowKgMin>0?s.fuel/flowKgMin:null,label:{normal:'ÜZEMANYAG',low:'BINGO FUEL',critical:'KRITIKUS ÜZEMANYAG',empty:'ÜZEMANYAG KIFOGYOTT'}[level]};
}
