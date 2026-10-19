# HR3 block-wise training and stage gates

This guide documents a safer next experiment for the 2026-10-19 HR3 checkpoint. It does not overwrite any existing checkpoint.

## Why change the training loop?

- The previous stage-end selector compared the number of **boss kills**, even though the target is player survival. It could select a candidate with worse survival fitness.
- The v3 evaluator returned average fitness but omitted player no-hit rate and edge fraction, so the trainer could not gate progression against the project's stated goals.
- Optimizing all 9,179 parameters at once gives CMA-ES a very sparse search signal. The new `BLOCK=readout_reflex` mode tunes the 320 readout parameters plus 7 reflex parameters (327 total) while preserving the HR3 synaptic gains.
- A failed gate now stops at the current stage rather than silently advancing to a longer episode or harder tier. Re-running the same TAG resumes from the saved candidate with a fresh CMA distribution; covariance is not persisted by the legacy state format.

## Recommended first experiment

Run from the repository root after installing the dependencies. Use a **new TAG** so the HR3 state remains untouched:

```bash
R='"survive":1,"strict":1,"HW":1500,"GW":1,"GCAP":300,"EW":3,"NHB":15000,"lives":3,"repeat":4,"cards":5'
REFLEX=1 EVAL=tools_local/v3/batch_eval3.mjs \
  BLOCK=readout_reflex \
  STAGES="[[\"t2_readout_reflex\",120,{\"mult\":1.6,\"tier\":2,\"maxF\":1800,$R,\"gateNoHit\":0.30,\"gateEdgeMax\":0.15}]]" \
  POP=32 NSEEDS=24 TESTN=300 SIG0=0.03 NGAINS=8859 \
  tools_local/venv/bin/python tools_local/cma/run_cma.py HR3_RF checkpoints_key/HR3_latest.json 12345 8
```

The gate thresholds are evaluated on held-out seeds: at least 30% no-hit episodes and at most 15% edge time. If the gate fails, the run stops and records the reason in `out/cma_HR3_RF_state.json`. Re-run the same command and TAG to continue the current stage; use a new TAG and the generated full checkpoint as the warm start if you want a clean, separate experiment.

## Other blocks

- `BLOCK=readout`: optimize only the 320 readout weights.
- `BLOCK=reflex`: optimize only the 7 reflex parameters (requires `REFLEX=1`).
- `BLOCK=gains`: optimize synaptic gains while freezing readout and reflex.
- `BLOCK=all`: legacy full-vector behavior.

For a first comparison, evaluate the baseline HR3 and the new candidate on the same 300 strict seeds. Do not judge success from training fitness or cherry-picked videos alone. Compare survival time, full-episode count, no-hit rate, mean hits, and edge fraction. The training evaluator's `bossKills` field means kills of the **boss**, not deaths of the fly.

## Tests

Run:

```bash
python -m unittest tools_local.cma.test_training_control
```

The tests cover block dimensions, the objective-aligned candidate selector, and inclusive stage-gate thresholds.
