#!/bin/bash
cd /workspace/fly-touhou-repo
ev(){ cp public/data/checkpoint_cma_HR.partial.json out/HR_$1.json
 A=$(REFLEX=1 TIER=2 MULT=1.6 NP=4 python3 tools_local/v3/survive_table.py 100 /workspace/fly_t2_eval_HR.png HR=out/HR_$1.json 2>&1 | grep "^| HR")
 B=$(TIER=2 MULT=1.6 NP=4 python3 tools_local/v3/survive_table.py 100 /tmp/b.png HZ=public/data/checkpoint_cma_HZ_t2.json HE=out/HE_restart_init.json 2>&1 | grep "^| H")
 printf -- "- $(date +%H:%M): HR $1, 100-seed strict tier-2 x1.6 eval (survival/full/no-hit/first hit/hits/graze/iframe/edge):\n%s\n%s\n" "$A" "$B" >> out/STATUS.md; printf "%s\n%s\n" "$A" "$B" > out/HR_$1_eval.txt; }
until grep -q " t2 gen 100 " out/cma_HR.nohup; do sleep 60; done; ev g100
until grep -q "DONE" out/cma_HR.nohup || ! pgrep -f "run_cma.py HR" >/dev/null; do sleep 60; done; ev final
