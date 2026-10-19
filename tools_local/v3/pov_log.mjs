// node pov_log.mjs ckpt seed out.json [maxFrames]  -> per-2-frame log in the /workspace/pov/render.py format (v3 or 80-neuron r4 flies)
import fs from 'fs';
import * as F3 from './fly.mjs';
import { features } from './eye2.mjs';
import { makeFly } from '../plastic/online.mjs';
import { makeGame } from '../cma/episode.mjs';
const [ck, seed, out, maxF] = [process.argv[2], +process.argv[3], process.argv[4], +(process.argv[5] || 1800)];
const w = JSON.parse(fs.readFileSync(ck, 'utf8')).weights; const v3 = ck.includes('v3') || w.length >= 320 + F3.NG3;
let B, pol, fly, lcCells; if (v3) { B = F3.makeBrain(); pol = F3.setParams(B, w); lcCells = B.plan.pool.map(x => x[0]).slice(0, 400); }
else { fly = makeFly(ck); for (let e = 0; e < fly.gain.length; e++) fly.brain.eWeight[e] = fly.base[e] * fly.gain[e]; fly.brain.reset(); }
const g = makeGame(seed, { mult: +(process.env.MULT||1.4), tier: +(process.env.TIER||0), dr: process.env.DR==='1', lives: 3, cards: 5, strict: true }); const log = []; let f = 0, m = { moveX: 0, moveY: 0, scores: [0, 0, 0, 0] }, dn = [], ft = [], killed = false;
if (v3) B.brain.reset();
while (f < maxF) {
  if (f % 4 === 0) { ft = features(g); if (v3) { dn = Array.from(F3.dnFromFeat(B, ft)); m = pol.forward(dn); if (process.env.REFLEX === '1') m = { ...F3.reflex(ft, m, B.rp || F3.RDEF), scores: m.scores }; } else { dn = Array.from(fly.brain.step(g.getBiologicalSensoryInput(), false)); m = fly.pol.forward(dn); } }
  g.update(m); f++; if (g.boss.hp <= 0) killed = true;
  if (f % 2 === 0) { const act = v3 ? B.brain.activity : fly.brain.activity; const lc = v3 ? lcCells.map(c => +act[c].toFixed(2)) : Array.from(act, v => +v.toFixed(2));
    log.push({ f, p: [g.player.x, g.player.y], lives: g.player.lives, hits: g.player.totalHits, graze: g.player.graze, score: g.player.score, boss: [g.boss.x, g.boss.y, Math.max(0, g.boss.hp), g.boss.maxHp],
      b: g.bullets.map(q => [+q.x.toFixed(1), +q.y.toFixed(1), +q.vx.toFixed(2), +q.vy.toFixed(2), q.radius || 3.5]), pb: g.playerBullets.map(q => [Math.round(q.x), Math.round(q.y)]),
      m: [m.moveX, m.moveY], sc: Array.from(m.scores || [0, 0, 0, 0]), dn, lc, feat: Array.from(ft.slice(0, 768), v => +v.toFixed(2)), dead: g.player.isDead, kill: killed, inv: g.player.invulnerableTimer > 0 }); }
  if (g.player.isDead) break;
}
fs.writeFileSync(out, JSON.stringify(log)); console.log('frames', f, 'kill', killed, 'hits', g.player.totalHits, 'score', g.player.score);
