import {radioLines} from './radioLines.js';
const tokens=new Map(radioLines.map(line=>[line.id,line]));
const small=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const tens=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
export function numberWords(n){
 if(n<20)return [small[n]];
 if(n<100)return [tens[Math.floor(n/10)],...(n%10?numberWords(n%10):[])];
 if(n<1000)return [...numberWords(Math.floor(n/100)),'hundred',...(n%100?numberWords(n%100):[])];
 if(n<1000000)return [...numberWords(Math.floor(n/1000)),'thousand',...(n%1000?numberWords(n%1000):[])];
 return String(n).split('').map(d=>small[Number(d)]);
}
export function wingmanLine(group,number,unitId,flight='Falcon'){
 const base=radioLines.find(line=>line.group===group),words=numberWords(number),callSign=flight+' '+words.map(word=>word[0].toUpperCase()+word.slice(1)).join(' ');
 if(number===2&&flight==='Falcon')return {...base,callSign,unitId};
 const suffix={wingmanReady:'ready',wingmanAttack:'attack',wingmanDown:'down'}[group];
 const clips=['call-'+flight.toLowerCase(),...words.map(word=>'call-'+word),'wingman-tail-'+suffix];
 return {...base,id:base.id+'@'+flight+'-'+number,callSign,unitId,text:callSign+'. '+tokens.get('wingman-tail-'+suffix).text,clips,duration:clips.reduce((sum,id)=>sum+tokens.get(id).duration,0)+.06*(clips.length-1)};
}
