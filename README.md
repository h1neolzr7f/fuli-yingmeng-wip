# 傅丽蝇梦 (work in progress) · Fuli Yingmeng WIP

> 真实果蝇连接组驱动的自机，在东方式高密度弹幕中"无压力生存 3 分钟"。
> A real fruit-fly connectome steering a Touhou-style danmaku game, aiming at **stress-free 3-minute survival in dense bullet patterns**.

This is a work-in-progress snapshot (2026-10-19) shared so other agents can improve the code and the training strategy. It is forked from the upstream project **fly-touhou** (https://github.com/w13630039663-bit/fly-touhou, MIT, © 2026 leimi). The original README is kept as `README_upstream.md` and the original `LICENSE` is unchanged.

---

## 1. 目标 / Goal

**中文**
- 最终目标：在高密度、高速、随机化的弹幕中（螺旋、自机狙、环形、交叉、随机雨），实现**稳定的 3 分钟无伤生存**。
- 规则（strict 模式）：
  - 碰到 Boss 算中弹，不能贴脸。
  - 无敌帧内的擦弹不计分，不能"吞弹"。
  - 不能靠贴边、蹲角落生存。贴边时间单独统计，目标 ≤15%。
- 风格：擦弹要好看（flashy grazing），但安全第一。
- 展示：游戏画面加果蝇视角（POV）视频，带复眼和 DN 驱动可视化。精选片段必须标注"cherry-picked"。
- 课程顺序：先在困难档稳定 30 s 无伤，再 60 s → 90 s → 180 s。

**English**
- Goal: stable no-hit survival for 3 minutes in dense, fast, randomized danmaku (spirals, aimed streams, rings, crossfire, random rain).
- Strict rules:
  - Touching the boss counts as a hit, so no face-hugging.
  - Grazes during invincibility frames don't count, so no bullet absorption.
  - No edge camping. Edge time is measured; the target is ≤15%.
- Grazing should look flashy, but safety comes first.
- Display: fly-POV videos showing the game, the compound eye and the descending-neuron (DN) drive. Cherry-picked clips must be labelled.
- Curriculum: stable 30 s no-hit on the hard tiers first, then 60 s → 90 s → 180 s.

## 2. 架构 / Architecture

**Brain.** The brain is a FlyEM MaleCNS slim graph, `public/data/connectome/graphSlim2kMB.json`:
- 2,000 neurons and about 32k synapses.
- It includes 959 LC/LPLC visual projection neurons, the mushroom body (KC/MBON/DAN) and 56 descending neurons.

**v3 eye** (`tools_local/v3/eye2.mjs`, 1,159 features):
- Full-field 16×20 density and approach grids.
- An 8×8 fly-centred fovea (density and approach).
- Boss and proprioception channels.
- Predictive time-to-contact (TTC) grids: a global grid plus a foveal one.

The features are mapped retinotopically onto LC/LPLC cell types by soma position:

| Cell types | Channel |
|---|---|
| LC4, LPLC1 | global TTC |
| LPLC2 | foveal TTC |
| LC10* | foveal density |
| LC11, LC9 | boss |
| LC21 | proprioception |

**Readout.** 16 DNs feed a 16-unit tanh layer, which outputs 4 action scores: moveX = tanh(R−L) and moveY = tanh(D−U). That is 320 parameters. On top of these are 8,852 trainable per-synapse gains (edges out of the visual cells plus edges into the DNs).

**Escape reflex** (`reflex()` in `tools_local/v3/fly.mjs`, env `REFLEX=1`; added at the HR generation):
- It is inspired by the LPLC2 → giant-fibre / DNp escape pathway.
- Foveal looming (TTC, approach×density, density) produces a repulsion vector. The reflex vetoes the part of the brain's motion that points toward the threat.
- A centripetal term (since HR2) biases escapes toward the arena centre.
- It has 7 trainable parameters, appended after the gains. The brain still chooses the move; the reflex only modulates it.

**Optimizer.** sep-CMA-ES (`tools_local/cma/run_cma.py`, pycma) with Node worker threads. The survive fitness is:

`frames − EW·edgeFrames − HW·hits + GW·min(graze, GCAP) + NHB·[no hit] − DGW·danger`

**Difficulty.** Density multiplier `mult` plus extra-pattern tier `tier` (0–3; each tier is +12% bullet speed). Training uses domain randomization.

## 3. 怎么跑 / How to run

```bash
npm install                     # if needed; the game sim itself is pure JS
python3 -m venv tools_local/venv && tools_local/venv/bin/pip install cma numpy
# PIL (Pillow) is needed for survive_table.py and the POV renderer: pip install pillow

# training (example: the HR3 setup, resumes from out/cma_<tag>_state.json if present)
R='"survive":1,"strict":1,"HW":1500,"GW":1,"GCAP":300,"EW":3,"NHB":15000,"lives":3,"repeat":4,"cards":5'
REFLEX=1 EVAL=tools_local/v3/batch_eval3.mjs \
  STAGES="[[\"t2\",200,{\"mult\":1.6,\"tier\":2,\"maxF\":1800,$R}]]" \
  POP=48 NSEEDS=24 SIG0=0.03 NGAINS=8859 \
  nohup tools_local/venv/bin/python tools_local/cma/run_cma.py MYTAG checkpoints_key/HR3_latest.json 12345 8 > out/cma_MYTAG.nohup &

# strict eval table + survival-curve PNG (100 seeds, hard tier 2)
REFLEX=1 TIER=2 MULT=1.6 NP=8 python3 tools_local/v3/survive_table.py 100 out.png HR3=checkpoints_key/HR3_latest.json
#  (omit REFLEX=1 for checkpoints trained without the reflex: HZ, HE, dmB2, v3w)

# POV log + render
REFLEX=1 MULT=1.6 TIER=2 node tools_local/v3/pov_log.mjs checkpoints_key/HR_final.json 140037 /workspace/pov_log_HR.json
# renderer scripts live outside this repo (/workspace/pov/render_*.py, not included). See "open problems".
```

Note on the clock: one run uses 8 cores. One generation at POP 48 × 24 seeds × 30 s episodes takes about 1–4 minutes.

## 4. 结果历史 / Results history

All results below are strict-mode evals on fixed seeds 90001+. The columns are: average survival with 3 lives, games survived the full 30 s, games with no hits, time to first hit, and fraction of time at the edges.

**Easy setting, tier 0, density 1.4 (200 seeds):**

| fly | survival | full 30 s | no-hit | edge |
|---|---|---|---|---|
| v3w (boss-band era) | 12.1 s | – | – | – |
| dmB2_e1.8 (dodge master) | 25.1 s | 123/200 | 17/200 | 21% |
| planner teacher (MPC, cheats with sim lookahead) | 30 s | – | 189/200 | – |

**Hard tier 2, density 1.6 (randomized patterns):**

| fly | seeds | survival | full 30 s | no-hit | first hit | hits/ep | edge |
|---|---|---|---|---|---|---|---|
| dmB2 | 100 | 15.7 s | 9 | 0 | 6.8 s | 2.86 | 20% |
| HT g140 | 100 | 17.8 s | 15 | 1 | 7.3 s | 2.80 | 10% |
| HE | 100 | 19.1 s | 17 | 3 | 8.9 s | 2.74 | 15% |
| HZ (zero-hit-first curriculum) | 100 | 19.5 s | 23 | 4 | 9.2 s | 2.63 | 20% |
| **HR** (+ escape reflex) | 300 | 24.1 s | 138 | 49 (16%) | 13.7 s | 2.07 | 22% |
| HR2_t2_60 (+ centripetal reflex, edge weight 3) | 300 | 24.8 s | 161 | 43 (14%) | 14.2 s | 1.97 | 16% |
| **HR3 g80** (in progress) | 300 | 25.0 s | 167 | 48 (16%) | 14.6 s | 1.90 | 19% |

Notes:
- The reflex is not doing the work alone. With the brain output zeroed, the reflex gets 17.7 s, 0 no-hit and 84% edge time (30 seeds). The gain comes from the reflex and the brain together.
- HR3 (from HR2_t2_60, held at tier 2 for 30 s, no-hit bonus 15,000) was still training when this snapshot was taken.
- `results/STATUS.md` is the chronological lab log. `results/*_eval.txt` holds the raw tables and `results/plots/` the survival curves.

## 5. 走不通的路 / Dead ends (measured)

- **Behaviour cloning / DAgger / soft targets from the MPC planner** through the 16-DN readout: agreement stayed at about the majority baseline.
- **Wider readouts.** Reading from all 56 DNs, or 56 DNs plus 980 central cells, gave 21–24% top-1 at tier 2 against a 17.5% baseline. That equals the raw-eye-feature ceiling (23%).
- **Richer eye:** the nearest 24 bullets (position, velocity, TTC) plus 2-frame memory, and per-move danger labels. The safe-move rate was 80–87% against 81% for the best constant move.
- **Action-chunk distillation** (K=3): 18% agreement.
- **Danger-weighted dense fitness (HG):** it plateaued and then declined.
- **Dopamine three-factor plasticity** (−hit, +graze, −danger): changes were at noise level (17.8 → 18.1 s).
- **Focus/slow-mode line (HF):** inconclusive. The eval script ignored `FOCUS` at the time, so its eval is invalid.
- **No-edge-penalty, no-credit fitness (HN):** no gain.
- **Lowering sigma, adding seeds per candidate, or restarting CMA:** each stalls at about 19 s without the reflex.

## 6. 未解决 / Open problems & next steps

1. **No-hit rate.** It is about 16% at tier 2, 30 s. The target is ≥30% before moving to 60 s episodes. HR2's fixed schedule advanced to 60 s and tier 3 too early.
2. **Edge time.** It is 16–22%; the target is ≤15%. Ideas: a wall term inside the reflex itself, a stronger centripetal parameter, or an edge-aware TTC channel.
3. **Stage gating.** The updated trainer supports optional `gateNoHit` and `gateEdgeMax` thresholds and stops at the current stage when they are not met. Legacy schedules without gate thresholds still advance by generation count; see [HR3 block-wise training](docs/HR3_BLOCKWISE_TRAINING.md).
4. **Reflex v2.** Ideas:
   - Directional looming per move direction, predicting the fly's own motion rather than assuming it is stationary.
   - A graded veto.
   - Learning which LPLC2 cells feed which direction, instead of fixed geometry.
5. **Plasticity on top of HR3.** Mushroom-body DAN reward with −hit only.
6. **Episode ramp.** 60 s → 90 s → 180 s, then tier 3 at density 1.8 and denser.
7. **Repo hygiene.**
   - The POV renderer (`/workspace/pov/render_*.py`) is not in this repo yet.
   - `tools_local/expert/check.mjs` only applies `REFLEX`; it ignores `FOCUS`.
   - CMA state files restore the stage and candidate mean, not pycma's full covariance state. Match `NGAINS`, `BLOCK`, and the original warm checkpoint when resuming; block-wise runs record a warm-checkpoint hash.

## 7. 内容说明 / What's included

**Included:**
- All source: `src/`, `tools_local/*` (cma, v3, expert, …), `tools/` and `_research/` scripts.
- Connectome graphs under `public/data/connectome` (all files are under 10 MB).
- Checkpoints in `public/data/` and `out/`.
- `checkpoints_key/`: HR3_latest, HR2_best_t2_60, HR_final, HZ_t2, HE, dmB2_e1.8, v3w.
- CMA states and logs (`out/`).
- `results/` (STATUS log, eval tables, plots).

**Excluded:**
- node_modules and Python venvs.
- Imitation datasets (`out/v3/chunk`, `out/v3/soft`; regenerate with `gen_soft.mjs` / `dagger3c.mjs`).
- `_archive/` raw downloads. The 543 MB .feather MaleCNS tables are re-downloadable from male-cns.janelia.org; see `_research/malecns/`.
- `experiments/journal`, `experiments/gif_analysis`.
- Videos (mp4).
- Any file over 10 MB.

## License

MIT. The original `LICENSE` © 2026 leimi is kept. Upstream: https://github.com/w13630039663-bit/fly-touhou. Connectome data © FlyEM / Janelia (MaleCNS v1.0); please cite them.


## 8. Training improvements (2026-10-19)

The safer block-wise CMA trainer, objective-aligned stage selection, no-hit/edge metrics, and performance-gated curriculum are documented in [HR3 block-wise training](docs/HR3_BLOCKWISE_TRAINING.md). The guide includes a recommended HR3 continuation command and unit-test instructions.
