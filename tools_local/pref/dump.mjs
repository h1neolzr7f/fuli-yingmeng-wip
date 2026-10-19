// node dump.mjs ckpt|still seed startFrame nFrames repeat out.json  -> per-frame states + clip features
import fs from 'fs';
import { makeFly } from '../plastic/online.mjs';
import { makeGame } from '../cma/episode.mjs';
import { plan } from '../expert/planner.mjs';
const [ck, seed, st, n, rep, out] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5], +process.argv[6] || 4, process.argv[7]];
const fly = (ck === 'still' || ck === 'planner') ? null : makeFly(ck);
if (fly) { for (let e = 0; e < fly.gain.length; e++) fly.brain.eWeight[e] = fly.base[e] * fly.gain[e]; fly.brain.reset(); }
const g = makeGame(seed, { mult: 1.4, lives: 3, cards: 5, strict: process.env.STRICT !== '0' });
const frames = []; let m = { moveX: 0, moveY: 0 }, f = 0;
let hp0, gz0, h0, sc0, dxs = 0, xs = [], ys = [], kill = 0, deathsSeen = 0;
while (f < st + n && !g.player.isDead) {
  if (f % rep === 0 && ck === 'planner') m = plan(g); else if (f % rep === 0 && fly) m = fly.pol.forward(fly.brain.step(g.getBiologicalSensoryInput(), false));
  if (f === st) { hp0 = g.boss.hp; gz0 = g.player.graze; h0 = g.player.totalHits; sc0 = g.player.score; }
  const hb = g.boss.hp; g.update(m); f++;
  if (f > st) {
    if (hb > 0 && g.boss.hp <= 0) kill = 1;
    dxs += Math.abs(g.boss.x - g.player.x); xs.push(g.player.x); ys.push(g.player.y);
    if (f % 2 === 0) frames.push({ p: [g.player.x, g.player.y, g.player.invulnerableTimer > 0 ? 1 : 0, f], hit: g.player.totalHits, b: [g.boss.x, g.boss.y, Math.max(0, g.boss.hp), g.boss.maxHp],
      bu: g.bullets.map(q => [Math.round(q.x), Math.round(q.y), q.radius || 3, q.color || '#fff']), pb: g.playerBullets.map(q => [Math.round(q.x), Math.round(q.y)]),
      s: g.player.score, l: g.player.lives, gz: g.player.graze });
  }
}
const N = xs.length || 1; const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const mx = mean(xs), my = mean(ys); const vel = xs.slice(1).map((x, i) => Math.hypot(x - xs[i], ys[i + 1] - ys[i]));
const feats = { frames: N, mean_dx: +(dxs / N).toFixed(1), dmg_per_sec: +(((hp0 - Math.max(0, g.boss.hp)) / N) * 60).toFixed(1), grazes: g.player.graze - gz0,
  hits: g.player.totalHits - h0, kill, move_var: +(mean(xs.map(x => (x - mx) ** 2)) + mean(ys.map(y => (y - my) ** 2))).toFixed(0), mean_speed: +mean(vel).toFixed(2),
  mean_y: +my.toFixed(0), score_gain: g.player.score - sc0, died: g.player.isDead ? 1 : 0 };
fs.writeFileSync(out, JSON.stringify({ ck, seed, st, feats, frames }));
console.log(JSON.stringify(feats));
