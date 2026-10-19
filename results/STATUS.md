# Fly dodge status (06:42 Asia/Shanghai, Oct 18)
NOTE: the box restarted around 06:22. out/ and /tmp were lost (old logs, CMA states, the HT gen-140 snapshot, earlier STATUS). Checkpoints in public/data survived. The Python venv was rebuilt.

## 06:39 eval: 100 seeds, strict, hard tier 2 (x1.6, randomized patterns)
| fly | survival | full 30 s | no-hit | first hit | hits/ep | graze | edge |
|---|---|---|---|---|---|---|---|
| HE (latest, ~gen 160) | 19.1 s | 17/100 | 3/100 | 8.9 s | 2.74 | 59.9 | 15% |
| HF (focus line; evaluated without focus mode) | 18.1 | 13 | 2 | 7.9 | 2.80 | 51.5 | 13% |
| HT (latest partial, ~gen 165) | 16.7 | 9 | 1 | 6.8 | 2.85 | 49.9 | 11% |
| HT gen 140 (earlier run, 05:03) | 17.8 | 15 | 1 | 7.3 | 2.80 | 53.5 | 10% |
| dmB2 | 15.7 | 9 | 0 | 6.8 | 2.86 | 43.6 | 20% |
HE is the best so far: modest gain over HT on every metric, still far from stable no-hit.
- Video: /workspace/fly_hard_t2_HE.mp4. HE, seed 120036, best of 150 scanned: cherry-picked (5/150 no-hit), 0 hits, full 30 s.
- Plot: /workspace/fly_t2_eval.png
- Restarted from checkpoint (fresh CMA state): HE2 (from HE, 5 workers), HF2 (from HF with FOCUS=1, 3 workers). Logs: out/cma_HE2.nohup, out/cma_HF2.nohup.
- Dead ends tonight: wider DN/central readout, richer bullet eye + memory, soft planner labels, danger-weighted fitness (HG), dopamine plasticity (noise-level).
- 08:42: HF2 dropped (flat ~1030 frames for 75 gens). HE2 at gen 95, flat-ish (~1090).
- 08:42: new line HN from HE (06:39 checkpoint): no edge penalty; frames in edge zones earn no survival credit (fitness = frames - edgeFrames - 800*hits + 2*graze + 6000 if no hit). Strict, tier 2 x1.6, 30 seeds, 3 workers. Log out/cma_HN.nohup. Note: this equals edge weight 1.0, vs 1.5 in previous lines.
- 09:25: 100-seed tier-2 eval (survival / full 30 s / no-hit / first hit / hits / edge): HN g35 18.2 s / 15 / 3 / 8.3 s / 2.77 / 18%; HE2 g140 18.7 / 20 / 2 / 7.6 / 2.74 / 14%; HE 19.1 / 17 / 3 / 8.9 / 2.74 / 15%. No line beats HE; no video. HN keeps running, edge time up slightly (18%).
- 10:16: 100-seed tier-2 eval: HN g80 17.5 s / 12 full / 0 no-hit / first hit 7.4 s / 2.83 hits / edge 15%; HE2 g195 18.6 / 14 / 2 / 8.1 / 2.77 / 17%; HE 19.1 / 17 / 3 / 8.9 / 2.74 / 15%. Both flat, below HE: HN and HE2 stopped. No video.
- 10:16: new line HZ (zero-hit-first curriculum) from HE: tier 1 x1.5 (150 gens) then tier 2 x1.6 (200 gens), hits 1500 each, no-hit bonus 10000, graze 1, edge 1.0 (no-credit), 30 seeds, 8 workers. Log out/cma_HZ.nohup.
- 12:19: HZ end of tier 1, 100-seed tier-1 x1.5 strict eval (survival/full/no-hit/first hit/hits/graze/iframe/edge):
| HZ_t1 | 22.5 | 39/100 | 13/100 | 11.1 | 2.22 | 55.7 | 5.5 | 16% |
| HE | 21.7 | 35/100 | 9/100 | 10.6 | 2.33 | 52.5 | 5.5 | 15% |
- 13:52: HZ tier-2 gen 100, 100-seed tier-2 x1.6 eval:
| HZ | 20.5 | 22/100 | 2/100 | 8.7 | 2.68 | 65.5 | 8.4 | 19% |
| HE | 19.1 | 17/100 | 3/100 | 8.9 | 2.74 | 59.9 | 8.9 | 15% |
- 14:33: HZ beats HE on tier 2 on survival (20.5 vs 19.1 s) and full 30 s (22 vs 17), but not on no-hit (2 vs 3), first hit (8.7 vs 8.9 s) or edge (19% vs 15%). Video /workspace/fly_hard_t2_HZ.mp4: HZ g100, seed 120052 best of 150 scanned (cherry-picked; 6/150 no-hit), 0 hits, 103 graze, full 30 s. HZ training still running (t2 gen 140 at 14:22).

## 17:23 Asia/Shanghai — HZ results + escape reflex
- HZ (zero-hit-first curriculum) finished 15:31. Tier-1 x1.5 100-seed eval: HZ_t1 22.5 s / 39 full / 13 no-hit / 2.22 hits / edge 16% vs HE 21.7 / 35 / 9 / 2.33 / 15%. Tier-2 x1.6 (gen 100): HZ 20.5 s / 22 full / 2 no-hit / 2.68 hits / edge 19% vs HE 19.1 / 17 / 3 / 2.74 / 15%.
- New: LPLC2/giant-fiber-like escape reflex (tools_local/v3/fly.mjs reflex(), env REFLEX=1). Fovea looming (TTC, approach x density, density) -> repulsion away from threats + veto of the brain's motion component toward the threat; 6 trainable params appended after the gains. Brain still picks the move; reflex modulates it.
- Sanity check, 30 tier-2 seeds (survival / hits / no-hit / edge):
  HZ alone 19.2 s / 2.63 / 0 / 21%; HZ + reflex (default) 20.8 / 2.33 / 5 / 28%;
  reflex with brain readout zeroed: 17.7 / 2.93 / 0 / 84% edge (reflex alone camps edges, no no-hit) -> the combination matters, not the reflex alone.
- Training line HR: CMA from HZ_t2 + reflex (8858 params), tier 1 x1.5 (80 gens) -> tier 2 x1.6 (200 gens), hits 1500, no-hit bonus 10000, edge 1.5, 30 seeds, 8 workers. Log out/cma_HR.nohup.
- 17:27: check.mjs eval now supports REFLEX=1 (and v3 checkpoints with extra params). 50-seed tier-2: HZ 19.6 s / 2 no-hit / edge 21%; HZ+reflex untrained 21.8 s / 3 no-hit / edge 35%. NOTE: earlier HF 'focus' evals did NOT apply focus mode (check.mjs ignored FOCUS) - HF result invalid.
- 21:13: HR g100, 100-seed strict tier-2 x1.6 eval (survival/full/no-hit/first hit/hits/graze/iframe/edge):
| HR | 24.3 | 50/100 | 10/100 | 13.3 | 2.13 | 62.5 | 5.6 | 24% |
| HZ | 19.5 | 23/100 | 4/100 | 9.2 | 2.63 | 60.8 | 8.1 | 20% |
| HE | 19.1 | 17/100 | 3/100 | 8.9 | 2.74 | 59.9 | 8.9 | 15% |
- 22:05: HR beats HZ on tier 2. Video /workspace/fly_hard_t2_HR.mp4: HR g100 (+reflex), seed 120037 best of 150 scanned (cherry-picked; 29/150 no-hit, 73/150 full 30 s), 0 hits, 112 graze, edge 8%, full 30 s. pov_log.mjs now supports REFLEX=1 and v3 checkpoints with extra params. HR training alive (t2 gen 140 at 21:53).

## 23:25 Asia/Shanghai — next generation
- HR (brain + escape reflex) at tier-2 gen 100, 100-seed strict tier-2 x1.6: 24.3 s / 50 full / 10 no-hit / first hit 13.3 s / 2.13 hits / edge 24% vs HZ 19.5 / 23 / 4 / 2.63 / 20%, HE 19.1 / 17 / 3 / 2.74 / 15%. Clear survival jump; edge too high.
- Added centripetal bias to the reflex (7th param kc: during escape, push toward arena centre (x 0.5, y 0.7)). 40-seed check on HR g195: kc 0 edge 19% / 7 no-hit; kc 0.3 20% / 9; kc 1.0 16% / 6 (noisy).
- Queued HR2 (auto-starts when HR finishes): CMA from HR final + kc 0.3, joint brain+reflex (8859 params), edge weight 3 (was 1.5), stages tier 2 30 s (150) -> tier 2 60 s (100) -> tier 3 x1.8 60 s (100). 24 seeds, 7 workers. Auto-evals at gen 75 and end of 30 s stage (out/HR2_*_eval.txt).
- 23:27: POV video /workspace/fly_hard_t2_HR_reflex.mp4 (HR g195 + reflex, tier 2, seed 140037, cherry-picked from 150: 19/150 no-hit; 0 hits, full 30 s).
- 23:26: HR final, 100-seed strict tier-2 x1.6 eval (survival/full/no-hit/first hit/hits/graze/iframe/edge):
| HR | 23.7 | 44/100 | 17/100 | 13.8 | 2.13 | 62.1 | 5.8 | 22% |
| HZ | 19.5 | 23/100 | 4/100 | 9.2 | 2.63 | 60.8 | 8.1 | 20% |
| HE | 19.1 | 17/100 | 3/100 | 8.9 | 2.74 | 59.9 | 8.9 | 15% |
- 00:59: HR2 g75 vs HR, 100-seed strict tier-2 x1.6 30 s eval:
| HR2 | 24.0 | 43/100 | 13/100 | 12.6 | 2.15 | 68.0 | 6.6 | 18% |
| HR | 23.7 | 44/100 | 17/100 | 13.8 | 2.13 | 62.1 | 5.8 | 22% |
- 03:05: HR2 t2end vs HR, 100-seed strict tier-2 x1.6 30 s eval:
| HR2 | 24.0 | 45/100 | 12/100 | 12.8 | 2.16 | 68.2 | 6.4 | 16% |
| HR | 23.7 | 44/100 | 17/100 | 13.8 | 2.13 | 62.1 | 5.8 | 22% |

## 08:15 Asia/Shanghai, Oct 19 — morning check
- HR2 auto-schedule had moved on to tier 2 60 s, then tier 3 x1.8 60 s (gen 20 at 08:02), although no-hit was still far below 30%. Stopped HR2 there (partial kept as out/HR2_t3_g20.json).
- 300-seed strict tier-2 x1.6 30 s eval (survival/full/no-hit/first hit/hits/graze/iframe/edge):
| HR2_t2_60 | 24.8 | 161/300 | 43/300 | 14.2 | 1.97 | 73.1 | 6.1 | 16% |
| HR2_t3g20 | 24.0 | 136/300 | 39/300 | 13.2 | 2.09 | 74.5 | 6.7 | 12% |
| HR | 24.1 | 138/300 | 49/300 | 13.7 | 2.07 | 64.8 | 6.3 | 22% |
- HR2_t2_60 is better than HR on survival, full 30 s, hits and edge, but not on no-hit (14% vs 16%). Not counted as a clear win, so no video.
- New line HR3: from HR2_t2_60, held at tier 2 x1.6 30 s for 200 gens, no-hit bonus 15000 (was 10000), edge 3, sigma 0.03, 24 seeds, 7 workers. Auto 300-seed evals at gen 80 and end (out/HR3_*_eval.txt). Log out/cma_HR3.nohup.
- 09:55: HR3 g80, 300-seed strict tier-2 x1.6 30 s eval:
| HR3 | 25.0 | 167/300 | 48/300 | 14.6 | 1.90 | 73.0 | 6.1 | 19% |
| HR2_t2_60 | 24.8 | 161/300 | 43/300 | 14.2 | 1.97 | 73.1 | 6.1 | 16% |
| HR | 24.1 | 138/300 | 49/300 | 13.7 | 2.07 | 64.8 | 6.3 | 22% |
