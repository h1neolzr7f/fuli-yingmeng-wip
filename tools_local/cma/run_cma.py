# CMA-ES trainer for the 320-param readout plus optional synaptic gains/reflex.
# Supports block-wise optimization and stage gates based on held-out no-hit/edge metrics.
import hashlib, json, os, subprocess, sys, time
import numpy as np
import cma
from training_control import block_indices, gate_failures, select_candidate

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
os.chdir(ROOT)
tag = sys.argv[1]
warm = sys.argv[2]
seedbase = int(sys.argv[3])
NW = sys.argv[4] if len(sys.argv) > 4 else "7"
STAGES = [
    ("s1_1.0x_hp400", 40, dict(mult=1.0, bossHp=400, lives=3, repeat=4)),
    ("s2_1.2x_hp700", 40, dict(mult=1.2, bossHp=700, lives=3, repeat=4)),
    ("s3_1.4x_full", 80, dict(mult=1.4, bossHp=0, lives=3, repeat=4)),
    ("s4_1.4x_full_r1", 40, dict(mult=1.4, bossHp=0, lives=3, repeat=1)),
]
if os.environ.get("STAGES"):
    STAGES = [(a, b, c) for a, b, c in json.loads(os.environ["STAGES"])]
POP = int(os.environ.get("POP", "48"))
NG = int(os.environ.get("NGAINS", "0"))
BLOCK = os.environ.get("BLOCK", "all").lower()
REFLEX_ENABLED = os.environ.get("REFLEX") == "1"
TESTN = int(os.environ.get("TESTN", "200"))
os.makedirs("out", exist_ok=True)
os.makedirs("public/data", exist_ok=True)

log = open(f"out/cma_{tag}.log", "a", buffering=1)
def L(*a):
    s = time.strftime("%H:%M:%S ") + " ".join(map(str, a))
    print(s, flush=True)
    log.write(s + "\n")

with open(warm, "r", encoding="utf-8") as f:
    warm_weights = json.load(f)["weights"]
full_dim = 320 + NG
base_full = np.zeros(full_dim, dtype=float)
ncopy = min(len(warm_weights), full_dim)
base_full[:ncopy] = np.asarray(warm_weights[:ncopy], dtype=float)
indices = block_indices(BLOCK, full_dim, NG, REFLEX_ENABLED)
base_hash = hashlib.sha256(base_full.tobytes()).hexdigest()

def expand(candidate):
    candidate = np.asarray(candidate, dtype=float)
    if len(candidate) != len(indices):
        raise ValueError("candidate dimension %d != BLOCK=%s dimension %d" %
                         (len(candidate), BLOCK, len(indices)))
    full = base_full.copy()
    full[indices] = candidate
    return full

def ev(cands, seeds, o):
    full_cands = [expand(c).tolist() for c in cands]
    p = subprocess.run(
        ["node", os.environ.get("EVAL", "tools_local/cma/batch_eval.mjs")],
        input=json.dumps({"cands": full_cands, "seeds": seeds, "o": o}),
        capture_output=True, text=True, env={**os.environ, "NW": NW},
    )
    if p.returncode != 0 or "@@RES@@" not in p.stdout:
        raise RuntimeError(
            "Evaluator failed (exit %s). stderr:\n%s\nstdout tail:\n%s" %
            (p.returncode, p.stderr[-4000:], p.stdout[-1000:])
        )
    return json.loads(p.stdout.split("@@RES@@")[-1])

def summary(m, n):
    parts = ["fit %.0f" % m.get("fit", 0),
             "bossKills %d/%d" % (m.get("bossKills", m.get("kills", 0)), n)]
    if "noHitRate" in m:
        parts.append("noHit %.1f%%" % (100 * m["noHitRate"]))
    if "meanHits" in m:
        parts.append("hits %.2f" % m["meanHits"])
    if "edgeFrac" in m:
        parts.append("edge %.1f%%" % (100 * m["edgeFrac"]))
    parts.append("frames %.0f" % m.get("meanFrames", m.get("frames", 0)))
    parts.append("graze %.1f" % m.get("meanGraze", m.get("graze", 0)))
    return " ".join(parts)

state_f = f"out/cma_{tag}_state.json"
start_stage = 0
resume_attempt = 0
x0 = base_full[indices].copy()
if os.path.exists(state_f):
    with open(state_f, "r", encoding="utf-8") as f:
        st = json.load(f)
    saved_block = st.get("block", "all")
    if saved_block != BLOCK:
        raise ValueError("State was saved with BLOCK=%s, current BLOCK=%s" % (saved_block, BLOCK))
    if st.get("base_hash") and st["base_hash"] != base_hash:
        raise ValueError("Warm checkpoint changed since state was saved; use a new TAG to avoid mixing runs")
    start_stage = int(st["stage"])
    x0 = np.asarray(st["x"], dtype=float)
    if len(x0) != len(indices):
        raise ValueError("State dimension does not match current BLOCK/NGAINS; use a new TAG")
    resume_attempt = int(st.get("attempt", 0))
    if st.get("gate_blocked") or int(st.get("gen", 0)) > 0:
        resume_attempt += 1
    L("resume stage", start_stage, "block", BLOCK, "dim", len(x0), "attempt", resume_attempt)

blocked = False
for si in range(start_stage, len(STAGES)):
    name, gens, o = STAGES[si]
    es = cma.CMAEvolutionStrategy(
        x0, float(os.environ.get("SIG0", "0.15")),
        {"popsize": POP, "seed": seedbase + si + resume_attempt * 1009,
         "verbose": -9, "CMA_diagonal": (True if len(x0) > 400 else 10)},
    )
    best = (-1e18, None, None)
    for g in range(gens):
        seed_offset = (g + resume_attempt * max(1, gens)) * 37
        seeds = [seedbase * 1000 + si * 10000 + seed_offset + k
                 for k in range(int(os.environ.get("NSEEDS", "20")))]
        X = es.ask()
        res = ev(X, seeds, o)
        es.tell(X, [-r["fit"] for r in res])
        i = int(np.argmax([r["fit"] for r in res]))
        if res[i]["fit"] > best[0]:
            best = (res[i]["fit"], np.array(X[i]), res[i])

        mean_full = expand(es.mean)
        with open(f"public/data/checkpoint_cma_{tag}.partial.json", "w", encoding="utf-8") as f:
            json.dump({"weights": list(map(float, mean_full)), "stage": name, "gen": g,
                       "block": BLOCK}, f)
        with open(state_f, "w", encoding="utf-8") as f:
            json.dump({"stage": si, "x": list(map(float, es.mean)), "block": BLOCK,
                       "base_hash": base_hash, "attempt": resume_attempt, "gen": g + 1}, f)
        if g % 5 == 0 or g == gens - 1:
            L(name, "gen", g, summary(res[i], int(os.environ.get("NSEEDS", "20"))),
              "sigma %.4f" % es.sigma)

    test_base = int(os.environ.get("TEST_SEED_BASE", "90001")) + resume_attempt * 10000
    test = list(range(test_base, test_base + TESTN))
    r = ev([es.mean, best[1]], test, o)
    pick_i = select_candidate(r, imitation=bool(o.get("imit")))
    pick = np.asarray(es.mean if pick_i == 0 else best[1], dtype=float)
    chosen = r[pick_i]
    L("STAGE_END", name, "mean", summary(r[0], TESTN), "| best", summary(r[1], TESTN),
      "| selected", "mean" if pick_i == 0 else "best")

    gate_nohit = o.get("gateNoHit")
    if gate_nohit is None and os.environ.get("GATE_NOHIT") not in (None, ""):
        gate_nohit = float(os.environ["GATE_NOHIT"])
    gate_edge = o.get("gateEdgeMax")
    if gate_edge is None and os.environ.get("GATE_EDGE_MAX") not in (None, ""):
        gate_edge = float(os.environ["GATE_EDGE_MAX"])
    failures = gate_failures(chosen, gate_nohit, gate_edge)

    full_pick = expand(pick)
    checkpoint = {
        "weights": list(map(float, full_pick)), "stage": name, "gen": gens, "block": BLOCK,
        "evaluation": {
            "testSeedBase": test_base, "testN": TESTN, "fit": chosen.get("fit"),
            "noHitRate": chosen.get("noHitRate"), "edgeFrac": chosen.get("edgeFrac"),
            "meanHits": chosen.get("meanHits"), "meanFrames": chosen.get("meanFrames"),
        },
    }
    with open(f"public/data/checkpoint_cma_{tag}_{name}.json", "w", encoding="utf-8") as f:
        json.dump(checkpoint, f)

    x0 = pick
    if failures:
        blocked = True
        with open(state_f, "w", encoding="utf-8") as f:
            json.dump({
                "stage": si, "x": list(map(float, x0)), "block": BLOCK,
                "base_hash": base_hash, "attempt": resume_attempt, "gen": gens,
                "gate_blocked": True, "gate_failures": failures,
                "gate_metrics": {"noHitRate": chosen.get("noHitRate"),
                                 "edgeFrac": chosen.get("edgeFrac")},
            }, f)
        L("GATE_BLOCKED", name, "; ".join(failures),
          "kept at current stage; rerun same TAG to continue from this candidate")
        break

    with open(state_f, "w", encoding="utf-8") as f:
        json.dump({"stage": si + 1, "x": list(map(float, x0)), "block": BLOCK,
                   "base_hash": base_hash, "attempt": resume_attempt, "gen": 0}, f)

with open(f"public/data/checkpoint_cma_{tag}.json", "w", encoding="utf-8") as f:
    json.dump({"weights": list(map(float, expand(x0))), "block": BLOCK}, f)
if blocked:
    L("STOPPED_AT_GATE", "block", BLOCK, "dim", len(x0))
else:
    L("DONE", "block", BLOCK, "dim", len(x0), "fullDim", full_dim)
