# CMA-ES over the 320-param readout with curriculum + action repeat. Per-gen checkpoint; resumable.
import json, subprocess, sys, os, time, numpy as np, cma
R = '/workspace/fly-touhou-repo'; os.chdir(R)
tag = sys.argv[1]; warm = sys.argv[2]; seedbase = int(sys.argv[3]); NW = sys.argv[4] if len(sys.argv) > 4 else '7'
STAGES = [  # (name, gens, opts)
  ('s1_1.0x_hp400', 40, dict(mult=1.0, bossHp=400, lives=3, repeat=4)),
  ('s2_1.2x_hp700', 40, dict(mult=1.2, bossHp=700, lives=3, repeat=4)),
  ('s3_1.4x_full',  80, dict(mult=1.4, bossHp=0,   lives=3, repeat=4)),
  ('s4_1.4x_full_r1', 40, dict(mult=1.4, bossHp=0, lives=3, repeat=1)),
]
if os.environ.get('STAGES'):
  STAGES=[(a,b,c) for a,b,c in json.loads(os.environ['STAGES'])]
POP=int(os.environ.get('POP','48'))
def ev(cands, seeds, o):
  p = subprocess.run(['node', os.environ.get('EVAL','tools_local/cma/batch_eval.mjs')], input=json.dumps({'cands': [list(map(float, c)) for c in cands], 'seeds': seeds, 'o': o}),
                     capture_output=True, text=True, env={**os.environ, 'NW': NW})
  return json.loads(p.stdout.split('@@RES@@')[-1])
log = open(f'out/cma_{tag}.log', 'a')
def L(*a):
  s = time.strftime('%H:%M:%S ') + ' '.join(map(str, a)); print(s, flush=True); log.write(s + '\n'); log.flush()
_w = json.load(open(warm))['weights']
NG = int(os.environ.get('NGAINS', '0'))
x0 = np.array(_w[:320 + NG], float)
if NG and len(_w) > 320 and len(_w) < 320 + NG: x0 = np.concatenate([np.array(_w[:320], float), np.zeros(NG)])
if NG and len(x0) < 320 + NG: x0 = np.concatenate([x0[:320], np.zeros(NG)])
state_f = f'out/cma_{tag}_state.json'
start_stage = 0
if os.path.exists(state_f):
  st = json.load(open(state_f)); start_stage = st['stage']; x0 = np.array(st['x'], float); L('resume stage', start_stage)
best_overall = None
for si in range(start_stage, len(STAGES)):
  name, gens, o = STAGES[si]
  es = cma.CMAEvolutionStrategy(x0, float(os.environ.get('SIG0','0.15')), {'popsize': POP, 'seed': seedbase + si, 'verbose': -9, 'CMA_diagonal': (True if len(x0) > 400 else 10)})
  best = (-1e18, None, None)
  for g in range(gens):
    seeds = [seedbase * 1000 + si * 10000 + g * 37 + k for k in range(int(os.environ.get('NSEEDS','20')))]
    X = es.ask(); res = ev(X, seeds, o)
    es.tell(X, [-r['fit'] for r in res])
    i = int(np.argmax([r['fit'] for r in res]))
    if res[i]['fit'] > best[0]: best = (res[i]['fit'], np.array(X[i]), res[i])
    # checkpoint mean every gen
    json.dump({'weights': list(map(float, es.mean)), 'stage': name, 'gen': g}, open(f'public/data/checkpoint_cma_{tag}.partial.json', 'w'))
    json.dump({'stage': si, 'x': list(map(float, es.mean))}, open(state_f, 'w'))
    if g % 5 == 0 or g == gens - 1:
      L(name, 'gen', g, ('bestfit %.0f kills %d/'+os.environ.get('NSEEDS','20')+' dmg %.0f frames %.0f |dx| %.0f aligned %.0f graze %.1f imse %.3f') % (res[i]['fit'], res[i]['kills'], res[i]['dmg'], res[i]['frames'], res[i]['dx'], res[i]['aligned'], res[i]['graze'], res[i]['imse']), 'sigma %.3f' % es.sigma)
  # stage-end eval: mean and best on 200 held-out seeds at this stage's settings
  test = list(range(90001, 90001 + int(os.environ.get('TESTN','200'))))
  r = ev([es.mean, best[1]], test, o)
  L('STAGE_END', name, 'mean kills/200', r[0]['kills'], 'dmg %.0f surv %.0f |dx| %.0f graze %.1f imse %.3f' % (r[0]['dmg'], r[0]['frames'], r[0]['dx'], r[0]['graze'], r[0]['imse']), '| best kills/200', r[1]['kills'], 'dmg %.0f surv %.0f |dx| %.0f graze %.1f imse %.3f' % (r[1]['dmg'], r[1]['frames'], r[1]['dx'], r[1]['graze'], r[1]['imse']))
  if o.get('imit'): pick = es.mean if r[0]['imse'] <= r[1]['imse'] else best[1]
  if not o.get('imit'): pick = es.mean if r[0]['kills'] >= r[1]['kills'] else best[1]
  json.dump({'weights': list(map(float, pick)), 'stage': name, 'kills200': max(r[0]['kills'], r[1]['kills'])}, open(f'public/data/checkpoint_cma_{tag}_{name}.json', 'w'))
  x0 = np.array(pick)
  json.dump({'stage': si + 1, 'x': list(map(float, x0))}, open(state_f, 'w'))
json.dump({'weights': list(map(float, x0))}, open(f'public/data/checkpoint_cma_{tag}.json', 'w'))
L('DONE')
