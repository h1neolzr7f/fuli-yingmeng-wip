// node check.mjs ckpt|still|planner seedStart N [strict=1] -> JSON per-episode list; fixed full difficulty (no DR), 3 lives, repeat 4
import { makeFly } from '../plastic/online.mjs';
import { makeGame } from '../cma/episode.mjs';
import { plan } from './planner.mjs';
import fs from 'fs';
import * as F3 from '../v3/fly.mjs';
import { features } from '../v3/eye2.mjs';
const [ck, s0, N, st] = [process.argv[2], +process.argv[3], +process.argv[4], (process.argv[5] ?? '1') === '1'];
const isV3 = !['still', 'planner'].includes(ck) && (ck.includes('v3') || JSON.parse(fs.readFileSync(ck, 'utf8')).weights.length >= 320 + F3.NG3);
let B3 = null, pol3 = null; if (isV3) { B3 = F3.makeBrain(); pol3 = F3.setParams(B3, JSON.parse(fs.readFileSync(ck, 'utf8')).weights); }
const fly = (ck === 'still' || ck === 'planner' || isV3) ? null : makeFly(ck);
if (fly) for (let e = 0; e < fly.gain.length; e++) fly.brain.eWeight[e] = fly.base[e] * fly.gain[e];
const out = [];
for (let s = s0; s < s0 + N; s++) {
  if (fly) fly.brain.reset(); if (B3) B3.brain.reset(); const g = makeGame(s, { mult: +(process.env.MULT || 1.4), lives: 3, cards: 5, strict: st }); let f = 0, kf = 0, m = { moveX: 0, moveY: 0 }, dist = 0, close = 0, band = 0, fh = 0, edge = 0;
  while (!g.player.isDead && f < 1800) {
    if (f % 4 === 0) { if (ck === 'planner') m = plan(g); else if (B3) { const ft = features(g); m = pol3.forward(F3.dnFromFeat(B3, ft)); if (process.env.REFLEX === '1') m = F3.reflex(ft, m, B3.rp || F3.RDEF, [g.player.x / g.width, g.player.y / g.height]); } else if (fly) m = fly.pol.forward(fly.brain.step(g.getBiologicalSensoryInput(), false)); }
    g.update(m); f++; if (!kf && g.boss.hp <= 0) kf = f; if (!fh && g.player.totalHits > 0) fh = f; if (g.player.y > g.height - 70 || g.player.x < 35 || g.player.x > g.width - 35 || g.player.y < 150) edge++;
    const adx = Math.abs(g.boss.x - g.player.x), ddy = g.player.y - g.boss.y, d = Math.hypot(adx, ddy); dist += d; if (d < 100) close++; if (adx < 35 && ddy >= 120 && ddy <= 260) band++;
  }
  out.push({ s, frames: f, kill: kf > 0 ? 1 : 0, kf, dmg: +(g.boss.maxHp - Math.max(0, g.boss.hp)).toFixed(1), score: g.player.score, graze: g.player.graze, iframeGraze: g.iframeGrazes, hits: g.player.totalHits, firstHit: fh || f, edgeFrac: +(edge / f).toFixed(3), dist: +(dist / f).toFixed(1), closeFrac: +(close / f).toFixed(3), bandFrac: +(band / f).toFixed(3) });
}
console.log('@@RES@@' + JSON.stringify(out));
