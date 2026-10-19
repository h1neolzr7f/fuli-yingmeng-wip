#!/bin/bash
cd /workspace/fly-touhou-repo
R='"survive":1,"strict":1,"HW":1500,"GW":1,"GCAP":300,"EW":3,"NHB":15000,"lives":3,"repeat":4,"cards":5'
REFLEX=1 EVAL=tools_local/v3/batch_eval3.mjs STAGES="[[\"t2\",200,{\"mult\":1.6,\"tier\":2,\"maxF\":1800,$R}]]" POP=48 NSEEDS=24 TESTN=80 SIG0=0.03 NGAINS=8859 tools_local/venv/bin/python tools_local/cma/run_cma.py HR3 out/HR3_init.json 10106 7 > out/cma_HR3.nohup 2>&1 &
ev(){ A=$(REFLEX=1 TIER=2 MULT=1.6 NP=2 python3 tools_local/v3/survive_table.py 300 /workspace/fly_t2_eval_HR3.png HR3=$1 HR2_t2_60=out/HR3_init.json HR=out/HR_final.json 2>&1 | grep "^| HR"); printf -- "- $(date +%H:%M): HR3 $2, 300-seed strict tier-2 x1.6 30 s eval:\n%s\n" "$A" >> out/STATUS.md; echo "$A" > out/HR3_$2_eval.txt; }
until grep -q " t2 gen 80 " out/cma_HR3.nohup; do sleep 60; done; cp public/data/checkpoint_cma_HR3.partial.json out/HR3_g80.json; ev out/HR3_g80.json g80
until [ -f public/data/checkpoint_cma_HR3_t2.json ]; do sleep 60; done; ev public/data/checkpoint_cma_HR3_t2.json t2end
