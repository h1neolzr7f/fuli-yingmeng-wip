# usage: python3 fit_reward.py labels.json  (labels: {"1":"A","2":"B",...}) -> out/pref_reward.json
# Bradley-Terry / logistic regression on standardized feature differences (A-B), L2-regularized.
import json,sys,math
F=['mean_dx','dmg_per_sec','grazes','hits','kill','move_var','mean_speed','mean_y']
m=json.load(open('/workspace/pref_pairs/manifest.json')); lab=json.load(open(sys.argv[1]))
c={(r['pair'],r['side']):r for r in m}
X=[];Y=[]
for p,w in lab.items():
  a,b=c[(int(p),'A')],c[(int(p),'B')]; X.append([a[f]-b[f] for f in F]); Y.append(1 if w.upper()=='A' else 0)
sd=[max(1e-6,math.sqrt(sum(x[j]**2 for x in X)/len(X))) for j in range(len(F))]
X=[[x[j]/sd[j] for j in range(len(F))] for x in X]; w=[0.0]*len(F)
for it in range(3000):
  g=[0.1*wj for wj in w]
  for x,y in zip(X,Y):
    p=1/(1+math.exp(-sum(a*b for a,b in zip(w,x)))); 
    for j in range(len(F)): g[j]+= (p-y)*x[j]/len(X)
  w=[wj-0.3*gj for wj,gj in zip(w,g)]
acc=sum((sum(a*b for a,b in zip(w,x))>0)==(y==1) for x,y in zip(X,Y))/len(X)
out={'features':F,'weights_per_unit':{f:w[j]/sd[j] for j,f in enumerate(F)},'train_acc':acc,'n':len(X)}
json.dump(out,open('out/pref_reward.json','w'),indent=1); print(json.dumps(out,indent=1))
