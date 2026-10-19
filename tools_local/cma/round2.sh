#!/bin/bash
cd /workspace/fly-touhou-repo
while pgrep -f "run_cma.py (readout|gains) " >/dev/null; do sleep 10; done
export STAGES='[["h300",50,{"mult":1.4,"bossHp":300,"lives":3,"repeat":4,"DW":6000}],["h450",50,{"mult":1.4,"bossHp":450,"lives":3,"repeat":4,"DW":6000}],["h600",60,{"mult":1.4,"bossHp":600,"lives":3,"repeat":4,"DW":6000}],["h800",70,{"mult":1.4,"bossHp":800,"lives":3,"repeat":4,"DW":6000}],["h1000",100,{"mult":1.4,"bossHp":0,"lives":3,"repeat":4,"DW":6000}],["h1000_r1",50,{"mult":1.4,"bossHp":0,"lives":3,"repeat":1,"DW":6000}]]' POP=64
nohup tools_local/venv/bin/python tools_local/cma/run_cma.py r2readout public/data/checkpoint_cma_readout_s1_1.0x_hp400.json 7301 4 > out/cma_r2readout.nohup 2>&1 &
NGAINS=358 nohup tools_local/venv/bin/python tools_local/cma/run_cma.py r2gains public/data/checkpoint_cma_gains_s1_1.0x_hp400.json 7401 4 > out/cma_r2gains.nohup 2>&1 &
wait
