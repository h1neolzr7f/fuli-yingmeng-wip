#!/bin/bash
# Main path: all-synapse gains (1296) + readout, sep-CMA. Imitation(DAgger-style) -> Eureka reward search -> curriculum.
cd /workspace/fly-touhou-repo
PY=tools_local/venv/bin/python
L(){ echo "[$(date '+%T')] $*" | tee -a out/r3_summary.log; }
while pgrep -f "run_cma.py r2" >/dev/null; do sleep 10; done
node tools_local/cma/final_eval.mjs \
 cma_gains358:public/data/checkpoint_cma_r2gains_h1000_r1.json:1 cma_gains358_rep4:public/data/checkpoint_cma_r2gains_h1000.json:4 \
 cma_readout:public/data/checkpoint_cma_r2readout_h1000_r1.json:1 cma_readout_rep4:public/data/checkpoint_cma_r2readout_h1000.json:4 \
 overnight_clearR4_2:public/data/checkpoint_clearR4_2.json:1 lives4:public/data/checkpoint_3lives4.json:1 standing_still:idle:1 > out/eval_v2_r2.txt 2>&1
L "r2 eval written"
# warm: expand r2gains h600 (358) into 1296 layout
node -e '
import("./src/brain/connectome.js").then(({MaleCNSConnectome})=>{const fs=require("fs");const g=require("./public/data/connectome/graph.json");const b=new MaleCNSConnectome(g);const o=new Set(b.outputs);const w=JSON.parse(fs.readFileSync("public/data/checkpoint_cma_r2gains_h600.json")).weights;const full=new Array(b.ePost.length).fill(0);let j=0;for(let e=0;e<b.ePost.length;e++)if(o.has(b.ePost[e]))full[e]=w[320+j++]||0;fs.writeFileSync("public/data/checkpoint_warm_all1296.json",JSON.stringify({weights:w.slice(0,320).concat(full)}))})' 2>/dev/null
run(){ # tag warm workers pop stagesjson
  STAGES="$5" POP=$4 NGAINS=1296 $PY tools_local/cma/run_cma.py $1 $2 $((RANDOM+8000)) $3 > out/cma_$1.nohup 2>&1; }
# 1) imitation stage (on-policy teacher labels = DAgger-style, ES minimises imitation MSE)
run r3imit public/data/checkpoint_warm_all1296.json 7 64 '[["imit",40,{"mult":1.0,"bossHp":300,"lives":3,"repeat":4,"imit":true}]]'
L "$(grep STAGE_END out/cma_r3imit.log)"
W=public/data/checkpoint_cma_r3imit_imit.json
# 2) Eureka-style reward search at curriculum stage 1 (1.0x, 30% HP), 3 variants in parallel
run r3eA $W 2 48 '[["e",30,{"mult":1.0,"bossHp":300,"lives":3,"repeat":4,"DW":6000,"KB":30000}]]' &
run r3eB $W 3 48 '[["e",30,{"mult":1.0,"bossHp":300,"lives":3,"repeat":4,"DW":6000,"KB":30000,"AW":3}]]' &
run r3eC $W 3 48 '[["e",30,{"mult":1.0,"bossHp":300,"lives":3,"repeat":4,"DW":12000,"KB":60000,"AW":1}]]' &
wait
best=""; bk=-1
for v in A B C; do k=$(grep STAGE_END out/cma_r3e$v.log | sed -E 's/.*mean kills\/200 ([0-9]+).*best kills\/200 ([0-9]+).*/\1 \2/' | awk '{print ($1>$2)?$1:$2}'); L "eureka $v kills/200=$k :: $(grep STAGE_END out/cma_r3e$v.log | cut -c1-220)"; if [ "${k:-0}" -gt "$bk" ]; then bk=$k; best=$v; fi; done
case $best in A) R='"DW":6000,"KB":30000';; B) R='"DW":6000,"KB":30000,"AW":3';; C) R='"DW":12000,"KB":60000,"AW":1';; esac
L "eureka pick $best ($R)"
W=public/data/checkpoint_cma_r3e${best}_e.json
# 3) curriculum ladder with chosen reward
run r3cur $W 7 96 "[[\"c1.2_500\",50,{\"mult\":1.2,\"bossHp\":500,\"lives\":3,\"repeat\":4,$R}],[\"c1.4_600\",60,{\"mult\":1.4,\"bossHp\":600,\"lives\":3,\"repeat\":4,$R}],[\"c1.4_750\",70,{\"mult\":1.4,\"bossHp\":750,\"lives\":3,\"repeat\":4,$R}],[\"c1.4_900\",80,{\"mult\":1.4,\"bossHp\":900,\"lives\":3,\"repeat\":4,$R}],[\"c1.4_1000\",150,{\"mult\":1.4,\"bossHp\":0,\"lives\":3,\"repeat\":4,$R}]]"
grep STAGE_END out/cma_r3cur.log | tee -a out/r3_summary.log
cp public/data/checkpoint_cma_r3cur.json public/data/checkpoint_v2_best.json
node tools_local/cma/final_eval.mjs v2_allsyn_rep4:public/data/checkpoint_v2_best.json:4 v2_allsyn_rep1:public/data/checkpoint_v2_best.json:1 overnight_clearR4_2:public/data/checkpoint_clearR4_2.json:1 standing_still:idle:1 > out/eval_v2_final.txt 2>&1
L "R3 DONE"; touch out/R3_DONE
