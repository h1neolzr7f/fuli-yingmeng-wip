#!/bin/bash
cd /workspace/fly-touhou-repo
while pgrep -f "run_cma.py r2" >/dev/null; do sleep 10; done
node tools_local/cma/final_eval.mjs \
 cma_gains358:public/data/checkpoint_cma_r2gains_h1000_r1.json:1 \
 cma_gains358_rep4:public/data/checkpoint_cma_r2gains_h1000.json:4 \
 cma_readout:public/data/checkpoint_cma_r2readout_h1000_r1.json:1 \
 cma_readout_rep4:public/data/checkpoint_cma_r2readout_h1000.json:4 \
 overnight_clearR4_2:public/data/checkpoint_clearR4_2.json:1 \
 lives4:public/data/checkpoint_3lives4.json:1 \
 standing_still:idle:1 > out/eval_v2_r2.txt 2>&1
# round 3: main path = gains on ALL 1296 synapses + readout (sep-CMA), warm from r2gains h600; finer HP ladder
python3 - <<'PY'
import json
w=json.load(open('public/data/checkpoint_cma_r2gains_h600.json'))['weights']
import subprocess
# expand 358 DN-edge gains into 1296 layout
out=subprocess.run(['node','-e','''
import("./src/brain/connectome.js").then(({MaleCNSConnectome})=>{const g=require("./public/data/connectome/graph.json");const b=new MaleCNSConnectome(g);const o=new Set(b.outputs);const idx=[];for(let e=0;e<b.ePost.length;e++)if(o.has(b.ePost[e]))idx.push(e);process.stdout.write("@@"+JSON.stringify({n:b.ePost.length,idx}))})'''],capture_output=True,text=True).stdout.split('@@')[-1]
d=json.loads(out); full=[0.0]*d['n']
for j,e in enumerate(d['idx']): full[e]=w[320+j] if len(w)>320+j else 0.0
json.dump({'weights':w[:320]+full},open('public/data/checkpoint_warm_all1296.json','w'))
print('warm all-synapse dim',320+d['n'])
PY
export STAGES='[["a600",60,{"mult":1.4,"bossHp":600,"lives":3,"repeat":4,"DW":6000,"KB":30000}],["a700",70,{"mult":1.4,"bossHp":700,"lives":3,"repeat":4,"DW":6000,"KB":30000}],["a800",80,{"mult":1.4,"bossHp":800,"lives":3,"repeat":4,"DW":6000,"KB":30000}],["a900",90,{"mult":1.4,"bossHp":900,"lives":3,"repeat":4,"DW":6000,"KB":30000}],["a1000",150,{"mult":1.4,"bossHp":0,"lives":3,"repeat":4,"DW":6000,"KB":30000}]]' POP=96
NGAINS=1296 nohup tools_local/venv/bin/python tools_local/cma/run_cma.py r3all public/data/checkpoint_warm_all1296.json 7501 6 > out/cma_r3all.nohup 2>&1 &
# cheap baseline: readout-only same ladder, 2 workers
POP=48 nohup tools_local/venv/bin/python tools_local/cma/run_cma.py r3readout public/data/checkpoint_cma_r2readout_h600.json 7601 2 > out/cma_r3readout.nohup 2>&1 &
wait
