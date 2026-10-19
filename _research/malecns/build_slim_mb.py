#!/usr/bin/env python3
"""build_slim_mb.py — ~2k-neuron MaleCNS subgraph: slim LC spine + compact MB.

Selection (deterministic, no game outcomes):
  1. Visual: ~20 cells/type for the 8 game channels, then fill other LC/LPLC
     types to ~1.3k visual projection neurons.
  2. DN partners: always the 16 v1 readout DNs; plus a thin set of other DNs
     receiving >=20 contacts from selected LCs (cap).
  3. Thin bridge: top pathway-scored interneurons (LC in >=30, DN out >=30).
  4. Compact MB: ~500 KCs + every MBON/PAM/PPL/APL/DPM with >=3 contacts
     to the selected KC set (either direction).

Weights: additive two-segment bake (graph600a lesson):
  segment1 = edges whose pre is an input (channel LC) cell
  segment2 = all other edges
  per postsynaptic cell: |w| sums to 1 on seg1 and alpha on seg2 (alpha=1).

Outputs stay the 16 v1 DN body IDs (320-param readout contract).
DAN indices listed under `reward.dan` for later dopamine learning hooks.
"""
from __future__ import annotations

import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pyarrow.compute as pc
import pyarrow.feather as feather

HERE = Path(__file__).resolve().parent
REPO = Path("/workspace/fly-touhou-repo")
OUT_DIR = REPO / "public" / "data" / "connectome"
ANN = HERE / "body-annotations-male-cns-v1.0-minconf-0.5.feather"
NT = HERE / "body-neurotransmitters-male-cns-v1.0.feather"
WEIGHTS = HERE / "connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather"
G80 = OUT_DIR / "graph.json"

CHANNELS = ["LC4", "LC11", "LC9", "LC15", "LC16", "LC17", "LC21", "LPLC2"]
CHANNEL_SET = set(CHANNELS)
MIN_CONTACTS = 3
ALPHA = 1.0
NT_SIGN = {"acetylcholine": 1, "gaba": -1, "glutamate": -1}  # DA/OA/unclear -> 0
NT_CONF_FLOOR = 0.5

# budgets (soft; final trim to ~2000)
N_PER_CHANNEL = 20
N_PER_OTHER_LC = 25
VISUAL_TARGET = 1400
DN_EXTRA_CAP = 40
BRIDGE_CAP = 120
KC_SAMPLE = 450
TARGET_TOTAL = 2000


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sample_ids(ids, k, seed_tag: str):
    """Deterministic sample: sort by bodyId, take evenly spaced then fill by id."""
    ids = sorted(int(x) for x in ids)
    if len(ids) <= k:
        return ids
    # prefer evenly spaced across sorted IDs for anatomical spread
    step = len(ids) / k
    picked = []
    used = set()
    for i in range(k):
        j = min(len(ids) - 1, int(i * step))
        # jitter by hash of seed_tag to break ties stably
        off = int(hashlib.md5(f"{seed_tag}:{i}".encode()).hexdigest(), 16) % max(1, int(step))
        j = min(len(ids) - 1, j + off)
        while j in used:
            j = (j + 1) % len(ids)
        used.add(j)
        picked.append(ids[j])
    return sorted(picked)


def main() -> int:
    g80 = json.loads(G80.read_text())
    v1_out_ids = [g80["nodes"][i]["id"] for i in g80["outputs"]]
    v1_out_set = set(v1_out_ids)
    assert len(v1_out_ids) == 16

    print("loading annotations…")
    ann = feather.read_table(
        ANN, columns=["bodyId", "type", "superclass", "status", "somaLocation"]
    ).to_pandas()
    ann["type"] = ann["type"].fillna("")
    ann["superclass"] = ann["superclass"].fillna("")

    def ok_row(r):
        if r.status != "Traced":
            return False
        loc = r.somaLocation
        return loc is not None and hasattr(loc, "__len__") and len(loc) == 3

    meta = {}
    for r in ann.itertuples(index=False):
        if not ok_row(r):
            continue
        meta[int(r.bodyId)] = (
            str(r.type),
            str(r.superclass),
            [int(r.somaLocation[0]), int(r.somaLocation[1]), int(r.somaLocation[2])],
        )
    print(f"traced+soma universe: {len(meta)}")

    # neurotransmitter map
    nt = feather.read_table(
        NT, columns=["body", "consensus_nt", "predicted_nt_confidence"]
    ).to_pandas()
    ntmap = {}
    for r in nt.itertuples(index=False):
        name = r.consensus_nt
        if name is None or (isinstance(name, float) and math.isnan(name)):
            continue
        conf = float(r.predicted_nt_confidence or 0.0)
        ntmap[int(r.body)] = str(name).lower() if conf >= NT_CONF_FLOOR else "unclear"

    # ---------- weights (stream filter >=3) ----------
    print("loading weights (>=3)…")
    tbl = feather.read_table(WEIGHTS, columns=["body_pre", "body_post", "weight"], memory_map=True)
    tbl = tbl.filter(pc.greater_equal(tbl["weight"], MIN_CONTACTS))
    pre = tbl["body_pre"].to_numpy()
    post = tbl["body_post"].to_numpy()
    w = tbl["weight"].to_numpy()
    print(f"edges>={MIN_CONTACTS}: {len(pre)}")

    # ---------- 1. visual LC/LPLC ----------
    by_type = defaultdict(list)
    for bid, (typ, sc, _) in meta.items():
        if typ in CHANNEL_SET or typ.startswith("LC") or typ.startswith("LPLC"):
            # keep only LC\d / LPLC* style visual projection names
            if typ in CHANNEL_SET or typ[:2] == "LC" or typ.startswith("LPLC"):
                by_type[typ].append(bid)

    visual = set()
    # channel types first
    for ch in CHANNELS:
        pool = by_type.get(ch, [])
        visual.update(sample_ids(pool, N_PER_CHANNEL, f"ch:{ch}"))
    # other LC/LPLC types
    other_types = sorted(t for t in by_type if t not in CHANNEL_SET)
    for typ in other_types:
        if len(visual) >= VISUAL_TARGET:
            break
        need = min(N_PER_OTHER_LC, VISUAL_TARGET - len(visual))
        visual.update(sample_ids(by_type[typ], need, f"lc:{typ}"))
    print(f"visual selected: {len(visual)} types={len({meta[b][0] for b in visual})}")

    # ---------- 2. DN partners ----------
    # contacts from visual -> DN
    dn_in = defaultdict(int)
    for p, q, c in zip(pre, post, w):
        p, q = int(p), int(q)
        if p in visual and q in meta and meta[q][1] == "descending_neuron":
            dn_in[q] += int(c)

    dns = set(v1_out_ids)  # always keep readout contract
    # verify v1 DNs present
    missing = [i for i in v1_out_ids if i not in meta]
    if missing:
        print(f"WARNING: {len(missing)} v1 DNs lack traced+soma; keeping anyway if in ann")
        for bid in missing:
            # fall back: pull from raw ann without soma filter
            row = ann[ann.bodyId == bid]
            if len(row):
                r = row.iloc[0]
                loc = r.somaLocation
                pos = [int(loc[0]), int(loc[1]), int(loc[2])] if loc is not None and len(loc) == 3 else [40000, 20000, 30000]
                meta[int(bid)] = (str(r.type or "DN"), "descending_neuron", pos)

    extras = sorted(dn_in.keys(), key=lambda b: (-dn_in[b], b))
    extras = [b for b in extras if b not in dns and dn_in[b] >= 20]
    dns.update(extras[:DN_EXTRA_CAP])
    print(f"DNs: {len(dns)} (16 v1 + {len(dns)-16} extra); top extra contacts={dn_in[extras[0]] if extras else 0}")

    # ---------- 3. thin bridge ----------
    inn = defaultdict(int)   # LC -> cand
    outn = defaultdict(int)  # cand -> DN
    for p, q, c in zip(pre, post, w):
        p, q = int(p), int(q)
        if p in visual:
            inn[q] += int(c)
        if q in dns:
            outn[p] += int(c)
    bridge_scores = []
    for bid in set(inn) & set(outn):
        if bid in visual or bid in dns or bid not in meta:
            continue
        typ, sc, _ = meta[bid]
        if sc == "descending_neuron":
            continue
        # skip MB cells here; MB added separately
        if typ.startswith(("KC", "MBON", "PAM", "PPL", "APL", "DPM")):
            continue
        si, so = inn[bid], outn[bid]
        if si >= 30 and so >= 30:
            bridge_scores.append((min(si, so), -bid, bid))
    bridge_scores.sort(reverse=True)
    bridges = {bid for _, __, bid in bridge_scores[:BRIDGE_CAP]}
    print(f"bridges: {len(bridges)} (from {len(bridge_scores)} candidates)")

    # ---------- 4. compact MB ----------
    kc_pool = [b for b, (t, _, __) in meta.items() if t.startswith("KC")]
    kcs = set(sample_ids(kc_pool, KC_SAMPLE, "kc"))
    # MB partners connected to KCs
    kc_touch = defaultdict(int)
    for p, q, c in zip(pre, post, w):
        p, q = int(p), int(q)
        if p in kcs and q in meta:
            kc_touch[q] += int(c)
        if q in kcs and p in meta:
            kc_touch[p] += int(c)

    def is_mb_mod(typ: str) -> bool:
        return typ.startswith(("MBON", "PAM", "PPL")) or typ in ("APL", "DPM")

    mb_mods = {b for b, c in kc_touch.items() if b in meta and is_mb_mod(meta[b][0]) and c >= MIN_CONTACTS}
    # also include all MBONs/APL/DPM that exist with soma even if weak? user said "that connect"
    mb = kcs | mb_mods
    print(f"MB: {len(kcs)} KCs + {len(mb_mods)} mods = {len(mb)} "
          f"(MBON={sum(1 for b in mb_mods if meta[b][0].startswith('MBON'))}, "
          f"DAN={sum(1 for b in mb_mods if meta[b][0].startswith(('PAM','PPL')))}, "
          f"APL/DPM={sum(1 for b in mb_mods if meta[b][0] in ('APL','DPM'))})")

    # ---------- assemble & trim ----------
    nodeset = set(visual) | set(dns) | set(bridges) | set(mb)
    # ensure all in meta
    nodeset = {b for b in nodeset if b in meta}
    # if over target, trim other-LC visual first, then bridges, then extra DNs, then KCs
    if len(nodeset) > TARGET_TOTAL:
        print(f"trimming {len(nodeset)} -> ~{TARGET_TOTAL}")
        # protect: channel LCs, v1 DNs, MB mods, bridges keep, trim other visual & KCs
        channel_cells = {b for b in visual if meta[b][0] in CHANNEL_SET}
        protected = channel_cells | v1_out_set | mb_mods | bridges
        # drop other visual by reverse sample order (highest body id of non-channel)
        other_vis = sorted(visual - channel_cells, reverse=True)
        for b in other_vis:
            if len(nodeset) <= TARGET_TOTAL:
                break
            if b in protected:
                continue
            nodeset.discard(b)
            visual.discard(b)
        # trim KCs
        kc_sorted = sorted(kcs, reverse=True)
        for b in kc_sorted:
            if len(nodeset) <= TARGET_TOTAL:
                break
            if b in v1_out_set:
                continue
            nodeset.discard(b)
            kcs.discard(b)
        # trim extra DNs (lowest contacts first)
        extra_dns = sorted((b for b in dns if b not in v1_out_set), key=lambda b: (dn_in.get(b, 0), b))
        for b in extra_dns:
            if len(nodeset) <= TARGET_TOTAL:
                break
            nodeset.discard(b)
            dns.discard(b)

    nodes = sorted(nodeset)
    idx = {b: i for i, b in enumerate(nodes)}
    print(f"final neurons: {len(nodes)}")

    # roles
    input_ids = {b for b in nodes if meta[b][0] in CHANNEL_SET}
    output_ids = [b for b in v1_out_ids if b in idx]  # preserve v1 order
    assert len(output_ids) == 16, f"readout DNs present {len(output_ids)}/16"

    node_objs = []
    for b in nodes:
        typ, sc, pos = meta[b]
        nname = ntmap.get(b, "unclear")
        sign = NT_SIGN.get(nname, 0)
        if b in input_ids:
            role = "input"
        elif b in v1_out_set:
            role = "output"
        else:
            role = "interneuron"
        node_objs.append({
            "id": b,
            "type": typ,
            "position": pos,
            "nt": nname,
            "sign": sign,
            "role": role,
            "superclass": sc,
        })

    # induced edges
    edges_raw = []
    for p, q, c in zip(pre, post, w):
        p, q = int(p), int(q)
        if p in idx and q in idx:
            edges_raw.append((p, q, int(c)))
    print(f"induced edges: {len(edges_raw)}")

    # additive two-segment bake
    T1 = np.zeros(len(nodes), dtype=np.float64)
    T2 = np.zeros(len(nodes), dtype=np.float64)
    segs = []
    for p, q, c in edges_raw:
        i, j = idx[p], idx[q]
        sabs = abs(node_objs[i]["sign"])
        # seg1 = sensory (input) pre; seg2 = other
        seg = 1 if p in input_ids else 2
        segs.append(seg)
        (T1 if seg == 1 else T2)[j] += c * sabs

    edges = []
    for (p, q, c), seg in zip(edges_raw, segs):
        i, j = idx[p], idx[q]
        s = node_objs[i]["sign"]
        if seg == 1:
            ww = (c * s) / T1[j] if T1[j] else 0.0
        else:
            ww = (ALPHA * c * s) / T2[j] if T2[j] else 0.0
        edges.append([i, j, c, float(ww)])

    # inputs: [cellIdx, channelIdx]
    inputs = []
    for b in sorted(input_ids):
        typ = meta[b][0]
        inputs.append([idx[b], CHANNELS.index(typ)])

    outputs = [idx[b] for b in output_ids]

    # DAN reward hooks
    dan_idx = [
        i for i, n in enumerate(node_objs)
        if n["nt"] == "dopamine" or n["type"].startswith(("PAM", "PPL"))
    ]
    mbon_idx = [i for i, n in enumerate(node_objs) if n["type"].startswith("MBON")]
    kc_idx = [i for i, n in enumerate(node_objs) if n["type"].startswith("KC")]
    apl_dpm = [i for i, n in enumerate(node_objs) if n["type"] in ("APL", "DPM")]

    # self-check: DN seg sums
    out_set = set(outputs)
    s1 = defaultdict(float)
    s2 = defaultdict(float)
    for (pre_i, post_i, c, ww), seg in zip(edges, segs):
        if post_i in out_set:
            (s1 if seg == 1 else s2)[post_i] += abs(ww)
    s1_vals = [s1[o] for o in outputs]
    s2_vals = [s2[o] for o in outputs]
    print(f"DN seg1 |w| mean={np.mean(s1_vals):.3f} (expect ~0-1); seg2 mean={np.mean(s2_vals):.3f} (expect ~1)")

    role_counts = Counter(n["role"] for n in node_objs)
    nt_counts = Counter(n["nt"] for n in node_objs)
    type_counts = Counter(n["type"] for n in node_objs)

    graph = {
        "version": "malecns-slim2k-mb-v1",
        "nodes": node_objs,
        "edges": edges,
        "inputs": inputs,
        "outputs": outputs,
        "channels": CHANNELS,
        "normalisation": (
            "additive two-segment (graph600a lesson): per-post, edges from channel "
            "input cells normalised to sum|w|=1; all other edges to sum|w|=alpha "
            f"(alpha={ALPHA}). Protects LC→DN drive from bridge/MB dilution."
        ),
        "reward": {
            "dan": dan_idx,
            "mbon": mbon_idx,
            "kc": kc_idx,
            "apl_dpm": apl_dpm,
            "note": (
                "Indices into nodes[]. Engine does not yet inject reward; "
                "callers can gate plasticity or modulate DAN drive via these hooks."
            ),
        },
        "derived": {
            "builder": "build_slim_mb.py",
            "alpha": ALPHA,
            "minContacts": MIN_CONTACTS,
            "noGameOutcomesUsed": True,
            "selection": {
                "visual": len(visual & nodeset),
                "dns": len(dns & nodeset),
                "bridges": len(bridges & nodeset),
                "kcs": len(kcs & nodeset),
                "mbMods": len(mb_mods & nodeset),
                "nPerChannel": N_PER_CHANNEL,
                "bridgeCap": BRIDGE_CAP,
                "dnExtraCap": DN_EXTRA_CAP,
                "kcSample": KC_SAMPLE,
            },
        },
        "source": "https://male-cns.janelia.org/download/",
        "license": "CC BY 4.0 © HHMI Janelia",
    }

    out_path = OUT_DIR / "graphSlim2kMB.json"
    out_path.write_text(json.dumps(graph))
    gsha = hashlib.sha256(out_path.read_bytes()).hexdigest()

    contacts = int(sum(e[2] for e in edges))
    manifest = {
        "dataset": "FlyEM MaleCNS v1.0, min confidence 0.5, traced-only (slim LC + compact MB)",
        "license": "CC BY 4.0",
        "source": "https://male-cns.janelia.org/download/",
        "nodes": len(nodes),
        "edges": len(edges),
        "synapticContacts": contacts,
        "inputCells": len(inputs),
        "readoutCells": len(outputs),
        "graphFile": "graphSlim2kMB.json",
        "graphSha256": gsha,
        "channels": CHANNELS,
        "roleCounts": dict(role_counts),
        "ntCounts": dict(nt_counts),
        "typeCount": len(type_counts),
        "reward": {
            "danCount": len(dan_idx),
            "mbonCount": len(mbon_idx),
            "kcCount": len(kc_idx),
            "aplDpmCount": len(apl_dpm),
        },
        "selection": graph["derived"]["selection"],
        "normalisation": graph["normalisation"],
        "assumptions": (
            "Engineered 8-channel input injection; signed leaky tanh rate units; "
            "ACh +1, GABA/Glu -1, modulatory/unknown 0. Additive two-segment weights. "
            "Not a physiological whole-brain model."
        ),
        "sources": {
            "annotations": sha256(ANN),
            "neurotransmitters": sha256(NT),
            "edgesTracedOnly": sha256(WEIGHTS),
        },
        "estimatedUsPerFrame": round(len(edges) * 0.00486, 1),  # from v600 183.6µs / 37845
        "vs80neuron": {
            "v1UsPerFrame": 8.2,
            "edgeRatio": round(len(edges) / 1296, 2),
            "speedupFactorSlower": round((len(edges) * 0.00486) / 8.2, 1),
        },
    }
    man_path = OUT_DIR / "manifestSlim2kMB.json"
    man_path.write_text(json.dumps(manifest, indent=2))

    plan = f"""# Slim ~2k LC + mushroom body plan

## Goal
A game-loadable MaleCNS subgraph of about 2000 neurons: slim visual (LC/LPLC) spine,
thin DN partners + bridge, and a compact mushroom body for later dopamine learning —
without the dilution bug that hurt the raw 600-neuron graph.

## Files
- `public/data/connectome/graphSlim2kMB.json` — graph (baked additive weights)
- `public/data/connectome/manifestSlim2kMB.json` — counts + hashes
- Builder: `/workspace/malecns/build_slim_mb.py` (also copy under `_research/malecns/` if desired)

## Counts (this build)
| Slice | N |
|---|---|
| Total neurons | {len(nodes)} |
| Edges (≥{MIN_CONTACTS} contacts) | {len(edges)} |
| Synaptic contacts | {contacts} |
| Channel inputs (8 types) | {len(inputs)} |
| Readout DNs (v1 contract) | {len(outputs)} |
| Visual LC/LPLC (incl. non-channel) | {len(visual & nodeset)} |
| DNs (16 v1 + extras) | {len(dns & nodeset)} |
| Bridges | {len(bridges & nodeset)} |
| KCs | {len(kcs & nodeset)} |
| MB mods (MBON/DAN/APL/DPM) | {len(mb_mods & nodeset)} |
| DAN hook indices | {len(dan_idx)} |
| MBON hook indices | {len(mbon_idx)} |

## Normalisation (graph600a lesson)
Per postsynaptic neuron, edges from **channel input cells** are normalised so
Σ|w| = 1, and all other edges so Σ|w| = α (α={ALPHA}). That keeps LC→DN drive
from being washed out when bridges and MB cells fan in.

## Game wiring
- `channels` = {CHANNELS}
- `inputs` = `[nodeIndex, channelIndex]` for every selected cell whose type is a channel
- `outputs` = the same 16 v1 DN body IDs as `graph.json` (320-param CEM readout unchanged;
  if multiple cells share a DN type, the readout still addresses these 16 individuals)
- `reward.dan` / `reward.mbon` / `reward.kc` = node indices for future dopamine / Hebbian hooks
  (engine `setPlasticity` exists; reward injection not yet implemented)

## Speed estimate
Scaled from measured v600 = 183.6 µs/frame @ 37,845 edges ≈ 4.86 ns/edge.

| Graph | Edges | µs/frame (est.) | vs 80-neuron (8.2 µs) |
|---|---|---|---|
| v1 (80) | 1,296 | 8.2 (measured) | 1× |
| v600a | 37,845 | 183.6 (measured) | ~22× |
| slim2kMB | {len(edges)} | ~{manifest['estimatedUsPerFrame']} | ~{manifest['vs80neuron']['speedupFactorSlower']}× slower |

One eval game stays single-core; 8 cores ⇒ 8 parallel games. Full CEM at v600 budget
would be roughly {manifest['vs80neuron']['speedupFactorSlower']}× the v1 wall time
(v1 full CEM was ~756 s) — use fewer seeds/gens or frame-skip for first runs.

## How to load (no long train)
```js
// Node / headless
import {{ MaleCNSConnectome }} from './src/brain/connectome.js';
import fs from 'fs';
const g = JSON.parse(fs.readFileSync('public/data/connectome/graphSlim2kMB.json','utf8'));
const brain = new MaleCNSConnectome(g); // uses baked 4th-element weights
```
Browser: point `?brain=` wiring at this file the same way as v600a (manifest + checkpoint later).

## Training notes
1. Keep CEM readout at 320 params on the 16 DNs.
2. Do **not** re-enable single-segment per-post norm — baked weights already encode the fix.
3. Optional later: `brain.setPlasticity({{eta:1e-5, decay:0.01, renorm:true}})` and drive
   `reward.dan` cells with a scalar reward; start with η≤1e-5 (engine docs).
4. Earlier scale-ups tied v1 only after the additive fix; expect a tie unless MB plasticity
   or a better teacher (DAgger) is added.

## Sources
MaleCNS v1.0 flat connectome, CC BY 4.0, HHMI Janelia —
https://male-cns.janelia.org/download/
https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/
"""
    plan_path = OUT_DIR / "planSlim2kMB.md"
    plan_path.write_text(plan)

    print("wrote", out_path, f"({out_path.stat().st_size} bytes)")
    print("wrote", man_path)
    print("wrote", plan_path)
    print("roleCounts", dict(role_counts))
    print("reward", manifest["reward"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
