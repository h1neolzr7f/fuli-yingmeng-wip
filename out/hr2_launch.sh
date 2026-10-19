#!/bin/bash
cd /workspace/fly-touhou-repo
until grep -q "DONE" out/cma_HR.nohup || ! pgrep -f "run_cma.py HR " >/dev/null; do sleep 30; done
sleep 5; F=public/data/checkpoint_cma_HR_t2.json; [ -f $F ] || F=public/data/checkpoint_cma_HR.partial.json
python3 -c "
import json;w=json.load(open('$F'))['weights'];w=w[:320+8858]+[0.3];json.dump({'weights':w},open('out/HR2_init.json','w'))"
R='"survive":1,"strict":1,"HW":1500,"GW":1,"GCAP":300,"EW":3,"NHB":10000,"lives":3,"repeat":4,"cards":5'
REFLEX=1 EVAL=tools_local/v3/batch_eval3.mjs STAGES="[[\"t2\",150,{\"mult\":1.6,\"tier\":2,\"maxF\":1800,$R}],[\"t2_60\",100,{\"mult\":1.6,\"tier\":2,\"maxF\":3600,$R}],[\"t3_60\",100,{\"mult\":1.8,\"tier\":3,\"maxF\":3600,$R}]]" POP=48 NSEEDS=24 TESTN=80 SIG0=0.04 NGAINS=8859 tools_local/venv/bin/python tools_local/cma/run_cma.py HR2 out/HR2_init.json 10006 7 > out/cma_HR2.nohup 2>&1 &
ev(){ A=$(REFLEX=1 TIER=2 MULT=1.6 NP=2 python3 tools_local/v3/survive_table.py 100 /workspace/fly_t2_eval_HR2.png HR2=$1 HR=$F 2>&1 | grep "^| HR"); printf -- "- $(date +%H:%M): HR2 $2 vs HR, 100-seed strict tier-2 x1.6 30 s eval:\n%s\n" "$A" >> out/STATUS.md; echo "$A" > out/HR2_$2_eval.txt; }
until grep -q " t2 gen 75 " out/cma_HR2.nohup; do sleep 60; done; cp public/data/checkpoint_cma_HR2.partial.json out/HR2_g75.json; ev out/HR2_g75.json g75
until [ -f public/data/checkpoint_cma_HR2_t2.json ]; do sleep 60; done; ev public/data/checkpoint_cma_HR2_t2.json t2end
