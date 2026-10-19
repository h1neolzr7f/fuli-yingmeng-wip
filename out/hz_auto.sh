#!/bin/bash
cd /workspace/fly-touhou-repo
until grep -q " t2 gen 0 " out/cma_HZ.nohup; do sleep 60; done
f=$(ls -t public/data/checkpoint_cma_HZ_t1*.json 2>/dev/null | head -1); [ -z "$f" ] && f=public/data/checkpoint_cma_HZ.partial.json
cp "$f" out/HZ_t1_end.json
T=$(TIER=1 MULT=1.5 NP=2 python3 tools_local/v3/survive_table.py 100 /workspace/fly_t1_eval_HZ.png HZ_t1=out/HZ_t1_end.json HE=out/HE_restart_init.json 2>&1 | grep "^| H")
printf -- "- $(date +%H:%M): HZ end of tier 1, 100-seed tier-1 x1.5 strict eval (survival/full/no-hit/first hit/hits/graze/iframe/edge):\n%s\n" "$T" >> out/STATUS.md
echo "$T" > out/HZ_t1_eval.txt
until grep -q " t2 gen 100 " out/cma_HZ.nohup; do sleep 60; done
cp public/data/checkpoint_cma_HZ.partial.json out/HZ_t2_g100.json
T=$(TIER=2 MULT=1.6 NP=2 python3 tools_local/v3/survive_table.py 100 /workspace/fly_t2_eval_HZ.png HZ=out/HZ_t2_g100.json HE=out/HE_restart_init.json 2>&1 | grep "^| H")
printf -- "- $(date +%H:%M): HZ tier-2 gen 100, 100-seed tier-2 x1.6 eval:\n%s\n" "$T" >> out/STATUS.md
echo "$T" > out/HZ_t2_eval.txt
