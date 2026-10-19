#!/bin/bash
set -u
cd /workspace/fly-touhou-repo
LOG=out/overnight.log
export FIERCE=1 LIVES=3 CARDS=5 HARD_MULT=1.4 DMG_W=20 KILL_BONUS=50000 ALIGN_W=5 SCORE_W=2 TRAIN_FRAMES=1800
log(){ echo "[$(date '+%F %T')] $*" | tee -a $LOG; }
pick_best(){
  BEST=""; BK=-1; BS=-1
  for ck in public/data/checkpoint_clear1b.json public/data/checkpoint_clearR*_?.json; do
    [ -f "$ck" ] || continue
    L=$(HARD_MULT=1.4 CARDS=5 LIVES=3 RAND=0 node tools_local/hard_eval.mjs 80 "t:$ck:F" 2>/dev/null | grep '^t |')
    K=$(echo "$L" | awk -F'|' '{split($5,a,"/");print a[1]+0}'); S=$(echo "$L" | awk -F'|' '{print $8+0}')
    log "probe $ck -> $L"
    if [ "$K" -gt "$BK" ] || { [ "$K" -eq "$BK" ] && [ "$S" -gt "$BS" ]; }; then BEST=$ck; BK=$K; BS=$S; fi
  done
  cp "$BEST" public/data/checkpoint_clear_best.json; echo "$BEST" > out/overnight_best.txt
  log "BEST=$BEST kills80=$BK score=$BS"
}
R=${START_ROUND:-2}
pick_best
while [ "$(date +%H)" -lt 7 ]; do
  WARM=$(cat out/overnight_best.txt)
  log "round $R warm=$WARM"
  for N in 1 2; do
    ( WARM=$WARM WARM_SIGMA=0.22 node train.js --out public/data/checkpoint_clearR${R}_${N}.json --workers 7 --generations 60 --pop 160 --elite 14 --seeds 30 --cem-seed $((20261200+R*10+N)) --no-controls > out/clearR${R}_${N}.log 2>&1
      [ -f public/data/checkpoint_clearR${R}_${N}.json ] || python3 -c "import json;d=json.load(open('public/data/checkpoint_clearR${R}_${N}.json.partial.json'));json.dump({'weights':d['weights'],'bestFitness':d['bestFitness']},open('public/data/checkpoint_clearR${R}_${N}.json','w'))" ) &
  done
  wait
  pick_best
  R=$((R+1))
done
log "training cutoff; final eval"
touch out/TRAINING_DONE
