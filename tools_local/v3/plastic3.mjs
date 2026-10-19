// Dopamine three-factor plasticity through reward.dan on the v3 fly (slim2kMB + full-field eye).
// Reward r = A*dmg + K*kill - H*hit is injected as drive into the 326 reward.dan cells; the dopamine signal is the
// mean DAN activity minus a running baseline (RPE-like). Plastic edges: KC->MBON (mushroom body) + the trained gain
// edges (visual->*, *->DN). e <- lam*e + pre*post ; gain += eta * delta * e, gain in [0,4].
// usage: node plastic3.mjs ckpt nTrain hp.json|"" out.json
import fs from 'fs';
import * as F3 from './fly.mjs';
import { features } from './eye2.mjs';
import { makeGame } from '../cma/episode.mjs';
export const DEF = { eta: 5e-5, lam: 0.9, A: 1, K: 20, H: 5, rb: 0.99, plastic: true };
export function makePlasticFly(ck) {
  const B = F3.makeBrain(); const w = JSON.parse(fs.readFileSync(ck, 'utf8')).weights; const pol = F3.setParams(B, w);
  const R = F3.GRAPH3.reward; const kc = new Set(R.kc), mbon = new Set(R.mbon); const br = B.brain;
  const pl = new Set(B.gidx); for (let e = 0; e < br.ePost.length; e++) if (kc.has(br.ePre[e]) && mbon.has(br.ePost[e])) pl.add(e);
  const edges = Int32Array.from([...pl]); const base = Float64Array.from(edges, e => B.base[e]);
  const gain = Float64Array.from(edges, (e, j) => B.base[e] ? br.eWeight[e] / B.base[e] : 1);
  br.extCells = [...br.extCells, ...R.dan]; return { B, pol, edges, base, gain, elig: new Float64Array(edges.length), dan: R.dan, rbar: 0, nKCMBON: pl.size - B.gidx.length };
}
export function play(P, seed, o, hp) {
  const { B, pol, edges, base, gain, elig, dan } = P; const br = B.brain; br.reset(); elig.fill(0);
  for (let j = 0; j < edges.length; j++) br.eWeight[edges[j]] = base[j] * gain[j];
  const g = makeGame(seed, o); let f = 0, kf = 0, m = { moveX: 0, moveY: 0 }, lastHp = g.boss.hp, lastHits = 0, lastGz = 0, r = 0;
  while (!g.player.isDead && f < 1800) {
    if (f % 4 === 0) {
      for (const c of dan) br.extDrive[c] = 2 * Math.max(-1, Math.min(1, r / 5));
      m = pol.forward(F3.dnFromFeat(B, features(g)));
      if (hp.plastic) {
        const a = br.activity; let da = 0; for (const c of dan) da += a[c]; da /= dan.length;
        const delta = da - P.rbar; P.rbar = hp.rb * P.rbar + (1 - hp.rb) * da;
        for (let j = 0; j < edges.length; j++) { const e = edges[j]; elig[j] = hp.lam * elig[j] + a[br.ePre[e]] * a[br.ePost[e]];
          if (delta !== 0 && elig[j] !== 0) { const ng = Math.max(0, Math.min(4, gain[j] + hp.eta * delta * elig[j])); if (ng !== gain[j]) { gain[j] = ng; br.eWeight[e] = base[j] * ng; } } }
      }
      const dmg = (lastHp - g.boss.hp) / 1.8, hits = g.player.totalHits - lastHits, kill = (!kf && g.boss.hp <= 0) ? 1 : 0; const gz = g.player.graze - lastGz; lastGz = g.player.graze; lastHp = g.boss.hp; lastHits = g.player.totalHits;
      let dg = 0; if (hp.DG) { const px = g.player.x, py = g.player.y; for (const b of g.bullets) { const d = Math.hypot(b.x - px, b.y - py); if (d < 48) dg += (1 - d / 48) ** 2; } }
      r = hp.A * dmg + hp.K * kill - hp.H * hits + (hp.G || 0) * gz - (hp.DG || 0) * dg;
    }
    g.update(m); f++; if (!kf && g.boss.hp <= 0) kf = f;
  }
  return { frames: f, dmg: g.boss.maxHp - Math.max(0, g.boss.hp), kill: kf > 0 ? 1 : 0, kf, score: g.player.score, graze: g.player.graze, hits: g.player.totalHits };
}
if (process.argv[1].endsWith('plastic3.mjs')) {
  const [ck, nTrain, hpf, outf] = [process.argv[2], +process.argv[3] || 200, process.argv[4], process.argv[5] || 'out/v3/plastic3.json'];
  const hp = { ...DEF, ...(hpf ? JSON.parse(fs.readFileSync(hpf, 'utf8')) : {}) }; const o = { mult: +(process.env.MULT || 1.4), tier: +(process.env.TIER || 0), lives: 3, cards: 5, strict: true, repeat: 4 };
  const NE = +(process.env.NEVAL || 100);
  const evalSet = (P, plastic) => { const g0 = Float64Array.from(P.gain); let K = 0, D = 0, F = 0, S = 0, H = 0;
    for (let s = 90001; s < 90001 + NE; s++) { const r = play(P, s, o, { ...hp, plastic }); K += r.kill; D += r.dmg; F += r.frames; S += r.score; H += r.hits; }
    if (!plastic) P.gain.set(g0); return { kills: K, n: NE, dmg: +(D / NE).toFixed(1), surv_s: +(F / NE / 60).toFixed(1), score: Math.round(S / NE), hits: +(H / NE).toFixed(2) }; };
  const P0 = makePlasticFly(ck); console.log('plastic edges', P0.edges.length, 'KC->MBON', P0.nKCMBON);
  const before = evalSet(P0, false);
  const P = makePlasticFly(ck); const g0 = Float64Array.from(P.gain); const curve = []; let b = { k: 0, d: 0, f: 0, h: 0, n: 0 };
  for (let i = 0; i < nTrain; i++) { const r = play(P, 300001 + i, o, hp); b.k += r.kill; b.d += r.dmg; b.f += r.frames; b.h += r.hits; b.n++;
    if (b.n === 20) { let dr = 0; for (let j = 0; j < g0.length; j++) dr += Math.abs(P.gain[j] - g0[j]);
      curve.push({ ep: i + 1, kills20: b.k, dmg: +(b.d / 20).toFixed(1), surv_s: +(b.f / 20 / 60).toFixed(1), hits: +(b.h / 20).toFixed(2), drift: +(dr / g0.length).toFixed(5) }); console.log(JSON.stringify(curve.at(-1))); b = { k: 0, d: 0, f: 0, h: 0, n: 0 }; } }
  const afterFrozen = evalSet(P, false); const afterOnline = evalSet(P, true);
  fs.writeFileSync(outf, JSON.stringify({ ck, hp, before, afterFrozen, afterOnline, curve }, null, 1));
  const w = JSON.parse(fs.readFileSync(ck, 'utf8')).weights.slice(0, 320 + F3.NG3); const learned = w.slice(); while (learned.length < 320 + F3.NG3) learned.push(0);
  for (let j = 0; j < P.B.gidx.length; j++) { const k = P.edges.indexOf(P.B.gidx[j]); learned[320 + j] = P.gain[k] - 1; }
  fs.writeFileSync(outf.replace('.json', '_weights.json'), JSON.stringify({ weights: learned, note: 'v3 after dopamine learning (KC->MBON changes not stored in this format)' }));
  console.log('RESULT', JSON.stringify({ before, afterFrozen, afterOnline }));
}
