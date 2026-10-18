"""Offline radio/mask treatment of the dry Windows English voice recordings."""
import sys, json, wave, math, random, array
from pathlib import Path
root=Path(__file__).resolve().parent.parent
rows=json.loads((root/'assets/radio/script.json').read_text(encoding='utf-8'))
for index,row in enumerate(rows):
 with wave.open(str(Path(sys.argv[1])/(row['id']+'.wav')),'rb') as f:
  rate=f.getframerate(); assert f.getnchannels()==1 and f.getsampwidth()==2
  pcm=array.array('h',f.readframes(f.getnframes()))
 data=[v/32768 for v in pcm]; peak=max(map(abs,data),default=0); assert peak>.005
 significant=[i for i,v in enumerate(data) if abs(v)>peak*.018]
 data=data[max(0,significant[0]-int(rate*.04)):min(len(data),significant[-1]+int(rate*.12))]
 pilot=row['speaker']=='pilot'; hp=430 if pilot else 310; lp=2350 if pilot else 3150
 ah=math.exp(-2*math.pi*hp/rate); al=1-math.exp(-2*math.pi*lp/rate)
 rng=random.Random(5903+index); previous=high=low=low2=envelope=0; filtered=[]
 for i,x in enumerate(data):
  high=ah*(high+x-previous); previous=x; low+=al*(high-low); low2+=al*(low-low2)
  speech=math.tanh(low2*(3.2 if pilot else 2.7)); envelope=max(abs(speech),envelope*.998)
  grit=(rng.random()*2-1)*(.014 if pilot else .022)*envelope
  # Short, shallow RF fades, never long gaps which obscure a word.
  fade=.78 if (i+index*791)%int(rate*.73)<int(rate*.008) else 1
  filtered.append(speech*fade+grit)
 rms=math.sqrt(sum(v*v for v in filtered)/max(1,len(filtered))); gain=min(.82/max(map(abs,filtered)),.16/max(.001,rms))
 before=int(rate*.08); after=int(rate*.18); out=[]
 for i in range(before):out.append((rng.random()*2-1)*.023*math.sin(math.pi*i/before)**2)
 for i,v in enumerate(filtered):
  edge=min(1,i/(rate*.008),(len(filtered)-i-1)/(rate*.012));out.append(v*gain*max(0,edge))
 for i in range(after):out.append((rng.random()*2-1)*.025*math.exp(-i/(rate*.035)))
 encoded=array.array('h',(int(max(-.95,min(.95,v))*32767) for v in out))
 path=root/'assets/radio'/(row['id']+'.wav')
 with wave.open(str(path),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(encoded.tobytes())
 row.update(url='/assets/radio/'+path.name,duration=round(len(encoded)/rate,3))
(root/'src/radioLines.js').write_bytes(('// Pre-rendered English speech; generated from assets/radio/script.json.\nexport const radioLines='+json.dumps(rows,indent=1)+';\n').encode('utf-8'))
print(f'Processed {len(rows)} radio clips; {sum(r["duration"] for r in rows):.1f} seconds total.')
