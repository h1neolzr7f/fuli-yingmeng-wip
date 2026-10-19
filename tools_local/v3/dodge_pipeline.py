# waits for dmA2/dmB2 to finish, then: 200-seed survival eval, plasticity on winner, curve PNG, seed scan, POV video.
import subprocess,os,time,json,glob
os.chdir('/workspace/fly-touhou-repo'); D='public/data'; LOG=open('out/v3/pipeline.log','a')
def L(*a): s=time.strftime('%H:%M:%S ')+' '.join(map(str,a)); LOG.write(s+'\n'); LOG.flush()
def sh(c,env=None): L('RUN',c[:160]); r=subprocess.run(c,shell=True,capture_output=True,text=True,env={**os.environ,**(env or {})}); L('OUT',r.stdout[-3000:],r.stderr[-500:]); return r.stdout
while subprocess.run('pgrep -f "run_cma.py dm.2"',shell=True,capture_output=True).returncode==0: time.sleep(30)
L('training done')
c={}
for t in ('dmA2','dmB2'):
  for st in ('e1.8','e1.4'):
    f=f'{D}/checkpoint_cma_{t}_{st}.json'
    if os.path.exists(f): c[f'{t}_{st}']=f
args=' '.join(f'{k}={v}' for k,v in c.items())
out=sh(f'python3 tools_local/v3/survive_table.py 200 /workspace/fly_survival_curve.png {args} still=still planner_survive=planner',{'MULT':'1.4','NP':'8','PLAN_MODE':'survive'})
open('out/v3/survive200.md','w').write(out)
rows=json.load(open('/workspace/fly_survival_curve.json'))['rows']
cand=[r for r in rows if r['name'] in c and r['edge']<0.35] or [r for r in rows if r['name'] in c]
win=max(cand,key=lambda r:(r['surv']-3*r['hits']))['name']; L('winner',win); json.dump({'winner':win,'ckpt':c[win]},open('out/v3/winner.json','w'))
json.dump({'eta':1e-5,'A':0,'K':0,'H':5,'G':0.5,'lam':0.9},open('out/v3/plast/h_dodge.json','w'))
sh(f'node tools_local/v3/plastic3.mjs {c[win]} 200 out/v3/plast/h_dodge.json out/v3/plast/dodge.json',{'NEVAL':'100'})
# learning curve PNG
from PIL import Image,ImageDraw
P=json.load(open('out/v3/plast/dodge.json')); cv=P['curve']; W,H=900,500; im=Image.new('RGB',(W,H),'white'); d=ImageDraw.Draw(im); l,t,r,b=70,50,W-40,H-70
d.rectangle([l,t,r,b],outline='black'); d.text((l,15),f"Dopamine plasticity (-hit +graze via reward.dan) on {win}: survival per 20-episode block (strict, x1.4)",fill='black')
mx=30; xs=lambda i:l+(r-l)*i/max(1,len(cv)-1); ys=lambda v:b-(b-t)*v/mx
for k in range(0,31,5): d.text((l-30,ys(k)-6),str(k),fill='black'); d.line([l-4,ys(k),l,ys(k)],fill='black')
pts=[(xs(i),ys(p['surv_s'])) for i,p in enumerate(cv)]; d.line(pts,fill=(31,119,180),width=3)
for i,p in enumerate(cv): d.text((xs(i)-8,b+8),str(p['ep']),fill='black')
d.text((l+300,b+35),'episodes of online learning',fill='black')
bf=P['before']['surv_s']; d.line([l,ys(bf),r,ys(bf)],fill=(214,39,40),width=1); d.text((r-260,ys(bf)-16),f"fixed fly on held-out seeds: {bf}s",fill=(214,39,40))
d.text((r-260,ys(bf)+4),f"after learning (frozen): {P['afterFrozen']['surv_s']}s; online: {P['afterOnline']['surv_s']}s",fill=(44,160,44))
im.save('/workspace/fly_learning_curve.png')
# seed scan for video: no-hit or fewest hits, low edge, most graze
sc=sh(f'node tools_local/expert/check.mjs {c[win]} 110001 120',{'MULT':'1.4'})
R=json.loads(sc.split('@@RES@@')[-1]); R.sort(key=lambda x:(x['hits'],x['edgeFrac']>0.3,-x['graze'])); best=R[0]; L('video seed',best)
nohit=sum(x['hits']==0 for x in R)
sh(f"node tools_local/v3/pov_log.mjs {c[win]} {best['s']} /workspace/pov_log_dodge.json")
lab=f"dodge master {win} · seed {best['s']} best of 120 scanned (cherry-picked; {nohit}/120 no-hit) · hits {best['hits']} graze {best['graze']} · strict x1.4"
src=open('/workspace/pov/render.py').read().replace('/workspace/pov_log_3.json','/workspace/pov_log_dodge.json').replace('/workspace/fly_pov.mp4','/workspace/fly_dodge_master.mp4').replace('checkpoint v3rl (CMA gen 9)',lab)
open('/workspace/pov/render_dodge.py','w').write(src)
sh('cd /workspace && nice python3 pov/render_dodge.py')
L('PIPELINE DONE')
