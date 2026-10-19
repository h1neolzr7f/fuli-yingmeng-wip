# sep-CMA-ES over readout(320)+all-synapse gains(1296): minimize open-loop MSE vs planner on expert obs sequences
import json,subprocess,sys,os,time,glob,numpy as np,cma
os.chdir('/workspace/fly-touhou-repo')
warm,out,gens=sys.argv[1],sys.argv[2],int(sys.argv[3]); files=sorted(glob.glob(sys.argv[4]))
POP=int(os.environ.get('POP','64')); NG=1296; SUB=int(os.environ.get('SUB','4'))
w=json.load(open(warm))['weights']; x0=np.array(w[:320]+(w[320:320+NG] if len(w)>=320+NG else [0.0]*NG),float)
es=cma.CMAEvolutionStrategy(x0,float(os.environ.get('SIG','0.08')),{'popsize':POP,'CMA_diagonal':True,'verbose':-9,'seed':5})
log=open(out.replace('.json','.log'),'a')
def ev(C,off):
  p=subprocess.run(['node','tools_local/expert/imit_eval.mjs'],input=json.dumps({'cands':[list(map(float,c)) for c in C],'files':files,'sub':SUB,'off':off}),capture_output=True,text=True)
  return json.loads(p.stdout.split('@@RES@@')[-1])
best=None
for g in range(gens):
  C=es.ask(); R=ev(C,g); es.tell(C,[r['mse'] for r in R]); i=int(np.argmin([r['mse'] for r in R]))
  m=es.mean; rm=ev([m],0)[0]
  s=f"{time.strftime('%H:%M:%S')} gen {g} best {R[i]['mse']:.4f} agree {R[i]['agree']:.3f} | mean-on-fold0 {rm['mse']:.4f} agree {rm['agree']:.3f} sigma {es.sigma:.4f}"
  print(s,flush=True); log.write(s+'\n'); log.flush()
  json.dump({'weights':list(map(float,m)),'note':'imitation of MPC planner via readout+synapse gains (sep-CMA-ES)','gen':g,'mse':rm['mse']},open(out,'w'))
