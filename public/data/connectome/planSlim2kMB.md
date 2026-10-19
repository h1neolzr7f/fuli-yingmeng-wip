# Slim ~2k LC + mushroom body plan

## Goal
A game-loadable MaleCNS subgraph of ~2000 neurons: slim visual (LC/LPLC) spine,
thin DN partners + bridge, and a compact mushroom body for later dopamine learning —
without the dilution bug that hurt the raw 600-neuron graph.

## Files
- `public/data/connectome/graphSlim2kMB.json` (1.38 MB)
- `public/data/connectome/manifestSlim2kMB.json`
- Builder: `_research/malecns/build_slim_mb.py` (source data in `/workspace/malecns/`)

## Counts
| Slice | N |
|---|---|
| Total neurons | 2000 |
| Edges (≥3 contacts) | 32163 |
| Synaptic contacts | 447359 |
| Channel inputs (8×~20) | 162 |
| Readout DNs (v1 contract) | 16 |
| Visual LC/LPLC | 955 |
| DNs (16 v1 + extras) | 56 |
| Bridges | 120 |
| KCs | 450 |
| MB mods (MBON/DAN/APL/DPM) | 419 |
| `reward.dan` hooks | 326 |
| `reward.mbon` hooks | 91 |

## Normalisation (graph600a lesson)
Per postsynaptic neuron: edges from **channel input** cells → Σ\|w\|=1;
all other edges → Σ\|w\|=α (α=1). Baked as edge[3]. Protects LC→DN drive
from bridge/MB fan-in dilution. DN check: mean seg1≈0.81, seg2≈1.00.

## Game wiring
- `channels` = LC4, LC11, LC9, LC15, LC16, LC17, LC21, LPLC2
- `inputs` = `[nodeIndex, channelIndex]` for channel-type cells only
- `outputs` = same 16 v1 DN body IDs as `graph.json` → **320-param CEM readout unchanged**
- `reward.dan` / `.mbon` / `.kc` / `.apl_dpm` = node indices for future dopamine hooks
  (engine `setPlasticity` exists; reward injection not yet wired)

## Speed (verified load + step, no training)
| Graph | Edges | µs/frame | vs 80 |
|---|---|---|---|
| v1 (80) same host | 1,296 | **24.7** measured | 1× |
| slim2kMB | 32,163 | **1495** measured | **~60× slower** |
| (HANDOVER quiet-host ref) | v1 8.2 / v600 183.6 | — | — |

Absolute µs are inflated by concurrent curriculum CEM on this box; use the
**60× ratio**. Full CEM at v1 budget (~756 s) ⇒ rough order **~12 h** on 8 cores
unless you cut seeds/gens or frame-skip.

## Load check (done)
```js
const g = JSON.parse(fs.readFileSync('public/data/connectome/graphSlim2kMB.json'));
const brain = new MaleCNSConnectome(g); // 2000 nodes, 32163 edges, ready=true
brain.step([0.9,0.1,0.8,0.2,0.7,0.3,0.6,0.4]); // 16 DN outs, rms≈2.6, active≈48%
```
No long train started.

## Training notes
1. Keep 320-param readout on the 16 DNs.
2. Do not strip baked weights / re-apply single-segment norm.
3. Later MB learning: `setPlasticity({eta:1e-5,…})` + drive `reward.dan`.
4. Expect tie with v1 until plasticity or a better teacher (DAgger) is added.

## Sources
MaleCNS v1.0 flat connectome, CC BY 4.0, HHMI Janelia
https://male-cns.janelia.org/download/
