# python3 table.py N name=ckpt ... -> shards each entry across procs, prints markdown table, saves out/expert/table.json
import sys,json,subprocess,os
from concurrent.futures import ThreadPoolExecutor
os.chdir('/workspace/fly-touhou-repo'); N=int(sys.argv[1]); items=[a.split('=',1) for a in sys.argv[2:]]; S0=int(os.environ.get('S0','90001')); SH=int(os.environ.get('SHARD','25'))
jobs=[(n,c,s) for n,c in items for s in range(S0,S0+N,SH)]
def run(j):
  n,c,s=j; p=subprocess.run(['node','tools_local/expert/check.mjs',c,str(s),str(min(SH,S0+N-s))],capture_output=True,text=True); return n,json.loads(p.stdout.split('@@RES@@')[-1])
R={}
with ThreadPoolExecutor(int(os.environ.get('NP','8'))) as ex:
  for n,r in ex.map(run,jobs): R.setdefault(n,[]).extend(r)
rows=[]
print('| fly | kills/%d | time-to-kill (s) | boss dmg | dmg/sec | survival (s) | hits | score | graze | mean dist to boss | frac <100px | frac in band |'%N); print('|'+'---|'*12)
for n,_ in items:
  r=R[n]; k=[x for x in r if x['kill']]; a=lambda f:sum(x[f] for x in r)/len(r)
  row=dict(name=n,kills=len(k),ttk=(sum(x['kf'] for x in k)/len(k)/60 if k else None),dmg=a('dmg'),dps=sum(x['dmg'] for x in r)/sum(x['frames'] for x in r)*60,surv=a('frames')/60,hits=a('hits'),score=a('score'),graze=a('graze'),dist=a('dist'),close=a('closeFrac'),band=a('bandFrac'))
  rows.append(row); print(f"| {n} | {row['kills']} | {'-' if row['ttk'] is None else '%.1f'%row['ttk']} | {row['dmg']:.0f} | {row['dps']:.1f} | {row['surv']:.1f} | {row['hits']:.2f} | {row['score']:.0f} | {row['graze']:.1f} | {row['dist']:.0f} | {row['close']:.2f} | {row['band']:.2f} |")
json.dump({'rows':rows,'raw':R},open(os.environ.get('OUT','out/expert/table.json'),'w'))
