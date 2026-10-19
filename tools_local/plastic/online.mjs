// Phase 2: dopamine-style three-factor plasticity on per-synapse gains (topology fixed).
// e_ij <- lam*e_ij + pre_j*post_i ;  dopamine d = A*dmg + K*kill - H*hit ;  delta = d - rbar ; g += eta*delta*e ; g in [0,4]
// usage: node online.mjs ckpt repeat nEpisodesTrain [hyper.json] [out.json]
import fs from 'fs';
import { MaleCNSConnectome } from '../../src/brain/connectome.js';
import { ReadoutPolicy } from '../../src/brain/policy.js';
import { GRAPH, makeGame } from '../cma/episode.mjs';
export function makeFly(ck) {
  const brain = new MaleCNSConnectome(GRAPH); const base = Float64Array.from(brain.eWeight);
  const w = JSON.parse(fs.readFileSync(ck, 'utf8')).weights; const extra = w.slice(320);
  const E = brain.ePost.length; const gain = new Float64Array(E).fill(1);
  if (extra.length === E) for (let e = 0; e < E; e++) gain[e] = Math.max(0, Math.min(4, 1 + extra[e]));
  else if (extra.length > 2) { const o = new Set(brain.outputs); let j = 0; for (let e = 0; e < E; e++) if (o.has(brain.ePost[e])) gain[e] = Math.max(0, Math.min(4, 1 + extra[j++])); }
  return { brain, base, gain, pol: new ReadoutPolicy(Float64Array.from(w.slice(0, 320))) };
}
export const DEF = { eta: 0.002, lam: 0.9, A: 1.0, K: 20, H: 5, rb: 0.99, mode: 'all', plastic: true };
export function playEpisode(fly, seed, o, hp) {
  const { brain, base, gain, pol } = fly; const E = gain.length;
  const apply = () => { for (let e = 0; e < E; e++) brain.eWeight[e] = base[e] * gain[e]; };
  apply(); brain.reset();
  const elig = fly.elig || (fly.elig = new Float64Array(E)); elig.fill(0);
  const outs = new Set(brain.outputs); const mask = new Uint8Array(E); for (let e = 0; e < E; e++) mask[e] = hp.mode === 'dn' ? (outs.has(brain.ePost[e]) ? 1 : 0) : 1;
  const g = makeGame(seed, o); const rep = o.repeat || 1;
  let f = 0, kf = 0, m = { moveX: 0, moveY: 0 }, lastHp = g.boss.hp, lastHits = 0, killed = false;
  fly.rbar = fly.rbar ?? 0;
  while (!g.player.isDead && f < 1800) {
    if (f % rep === 0) {
      m = pol.forward(brain.step(g.getBiologicalSensoryInput(), false));
      if (hp.plastic) {
        const a = brain.activity;
        for (let e = 0; e < E; e++) if (mask[e]) elig[e] = hp.lam * elig[e] + a[brain.ePre[e]] * a[brain.ePost[e]];
        const dmg = (lastHp - g.boss.hp) / 1.8; const hits = g.player.totalHits - lastHits; const kill = (!killed && g.boss.hp <= 0) ? 1 : 0;
        if (kill) killed = true; lastHp = g.boss.hp; lastHits = g.player.totalHits;
        const d = hp.A * dmg + hp.K * kill - hp.H * hits; const delta = d - fly.rbar; fly.rbar = hp.rb * fly.rbar + (1 - hp.rb) * d;
        if (delta !== 0) { let ch = false; for (let e = 0; e < E; e++) if (mask[e] && elig[e] !== 0) { const ng = Math.max(0, Math.min(4, gain[e] + hp.eta * delta * elig[e])); if (ng !== gain[e]) { gain[e] = ng; ch = true; } } if (ch) apply(); }
      }
    }
    g.update(m); f++; if (!kf && g.boss.hp <= 0) kf = f;
  }
  return { frames: f, dmg: g.boss.maxHp - g.boss.hp, kill: kf > 0, kf, score: g.player.score, graze: g.player.graze };
}
if (process.argv[1] && process.argv[1].endsWith('online.mjs')) {
  const [ck, rep, nTrain, hpf, outf] = [process.argv[2], +process.argv[3] || 4, +process.argv[4] || 400, process.argv[5], process.argv[6] || 'out/plastic_run.json'];
  const hp = { ...DEF, ...(hpf ? JSON.parse(fs.readFileSync(hpf, 'utf8')) : {}) };
  const o = { mult: Number(process.env.MULT || 1.4), lives: 3, repeat: rep, cards: 5, bossHp: Number(process.env.BOSS_HP || 0) };
  const evalSet = (fly, plastic) => { let K = 0, D = 0, F = 0, S = 0; const h = { ...hp, plastic }; const g0 = Float64Array.from(fly.gain);
    for (let s = 90001; s < 90201; s++) { const r = playEpisode(fly, s, o, h); K += r.kill; D += r.dmg; F += r.frames; S += r.score; }
    if (!plastic) fly.gain.set(g0); return { kills: K, dmg: D / 200, frames: F / 200, score: S / 200 }; };
  const fixed = makeFly(ck); const before = evalSet(fixed, false);
  const fly = makeFly(ck); const g0 = Float64Array.from(fly.gain); const curve = []; let blk = { k: 0, d: 0, f: 0, n: 0 };
  for (let i = 0; i < nTrain; i++) { const r = playEpisode(fly, 300001 + i, o, hp); blk.k += r.kill; blk.d += r.dmg; blk.f += r.frames; blk.n++;
    if (blk.n === 20) { let drift = 0; for (let e = 0; e < g0.length; e++) drift += Math.abs(fly.gain[e] - g0[e]); curve.push({ ep: i + 1, kills20: blk.k, dmg: +(blk.d / 20).toFixed(1), frames: +(blk.f / 20).toFixed(0), meanGainDrift: +(drift / g0.length).toFixed(4) }); console.log(JSON.stringify(curve.at(-1))); blk = { k: 0, d: 0, f: 0, n: 0 }; } }
  const learnedFrozen = evalSet(fly, false);
  const learnedOnline = evalSet(fly, true);
  const res = { ck, hp, before_fixed: before, after_learning_frozen: learnedFrozen, after_learning_still_plastic: learnedOnline, curve };
  fs.writeFileSync(outf, JSON.stringify(res, null, 1)); fs.writeFileSync(outf.replace('.json', '_weights.json'), JSON.stringify({ weights: Array.from(JSON.parse(fs.readFileSync(ck,'utf8')).weights.slice(0,320)).concat(Array.from(fly.gain, x => x - 1)) }));
  console.log('RESULT', JSON.stringify({ before, learnedFrozen, learnedOnline }));
}
