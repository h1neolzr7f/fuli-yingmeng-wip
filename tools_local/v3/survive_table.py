# python3 survive_table.py N png name=ckpt ... ; env MULT (default 1.4). Survival metrics + survival-curve PNG.
import sys,json,subprocess,os
from concurrent.futures import ThreadPoolExecutor
from PIL import Image,ImageDraw,ImageFont
os.chdir('/workspace/fly-touhou-repo'); N=int(sys.argv[1]); png=sys.argv[2]; items=[a.split('=',1) for a in sys.argv[3:]]; SH=25
jobs=[(n,c,s) for n,c in items for s in range(90001,90001+N,SH)]
def run(j):
  n,c,s=j; p=subprocess.run(['node','tools_local/expert/check.mjs',c,str(s),str(min(SH,90001+N-s))],capture_output=True,text=True); return n,json.loads(p.stdout.split('@@RES@@')[-1])
R={}
with ThreadPoolExecutor(int(os.environ.get('NP','8'))) as ex:
  for n,r in ex.map(run,jobs): R.setdefault(n,[]).extend(r)
print('| fly | survival (s, 3 lives) | full 30 s survived | no-hit episodes | time to first hit (s) | hits/ep | graze | i-frame grazes (excluded) | time at edges |'); print('|'+'---|'*9)
rows=[]
for n,_ in items:
  r=R[n]; a=lambda k:sum(x[k] for x in r)/len(r)
  row=dict(name=n,surv=a('frames')/60,full=sum(x['frames']>=1800 for x in r),nohit=sum(x['hits']==0 for x in r),fh=a('firstHit')/60,hits=a('hits'),graze=a('graze'),ifg=a('iframeGraze'),edge=sum(x.get('edgeFrac',0) for x in r)/len(r)); rows.append(row)
  print(f"| {n} | {row['surv']:.1f} | {row['full']}/{N} | {row['nohit']}/{N} | {row['fh']:.1f} | {row['hits']:.2f} | {row['graze']:.1f} | {row['ifg']:.1f} | {row['edge']*100:.0f}% |")
json.dump({'rows':rows,'raw':R},open(png.replace('.png','.json'),'w'))
# survival curve: fraction of episodes with no hit yet (solid) and still alive (dashed) vs time
W,H=900,520; im=Image.new('RGB',(W,H),'white'); d=ImageDraw.Draw(im); L,T,Rr,B=70,40,W-200,H-60
d.rectangle([L,T,Rr,B],outline='black'); cols=[(214,39,40),(31,119,180),(44,160,44),(255,127,14),(148,103,189),(140,86,75)]
for k in range(0,31,5): x=L+(Rr-L)*k/30; d.line([x,B,x,B+5],fill='black'); d.text((x-6,B+8),str(k),fill='black')
for k in range(0,11,2): y=B-(B-T)*k/10; d.line([L-5,y,L,y],fill='black'); d.text((L-40,y-6),f'{k*10}%',fill='black')
d.text((L+(Rr-L)//2-60,B+28),'time (s), strict, density x'+os.environ.get('MULT','1.4'),fill='black'); d.text((L,10),'Survival curves: solid = no hit yet, dashed = still alive (3 lives)',fill='black')
for ci,(n,_) in enumerate(items):
  r=R[n]; c=cols[ci%len(cols)]
  for key,dash in (('firstHit',False),('frames',True)):
    pts=[]
    for t in range(0,1801,10):
      frac=sum((x[key]>t) or (key=='frames' and x['frames']>=1800) or (key=='firstHit' and x['hits']==0) for x in r)/len(r)
      pts.append((L+(Rr-L)*t/1800,B-(B-T)*frac))
    for i in range(len(pts)-1):
      if not dash or (i//3)%2==0: d.line([pts[i],pts[i+1]],fill=c,width=3 if not dash else 2)
  d.line([Rr+15,T+20+ci*22,Rr+40,T+20+ci*22],fill=c,width=3); d.text((Rr+45,T+14+ci*22),n,fill='black')
im.save(png); print('png',png)
