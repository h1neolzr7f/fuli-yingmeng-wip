// planner expert sequences with rich-eye features: node gen3.mjs seedStart n out.json [studentW.json beta]
import fs from 'fs';
import { makeGame } from '../cma/episode.mjs';
import { planSoft } from '../expert/planner.mjs';
import { features } from './eye.mjs';
import { makeBrain, setParams, dnFromFeat } from './fly.mjs';
const [s0, n, out, sw, beta] = [+process.argv[2], +process.argv[3], process.argv[4], process.argv[5], +(process.argv[6] ?? 0.3)];
let B = null, pol = null; if (sw) { B = makeBrain(); pol = setParams(B, JSON.parse(fs.readFileSync(sw, 'utf8')).weights); }
const seqs = [], stats = [];
for (let s = s0; s < s0 + n; s++) {
  const g = makeGame(s, { mult: 1.4, lives: 3, cards: 5, strict: true, dr: (s % 2) === 1 }); const seq = []; let f = 0, m = { moveX: 0, moveY: 0 }; if (B) B.brain.reset();
  while (!g.player.isDead && f < 1800) {
    if (f % 4 === 0) { const ft = features(g); const t = planSoft(g); const sp = []; for (let i = 0; i < ft.length; i++) if (ft[i] !== 0) sp.push(i, +ft[i].toFixed(3)); seq.push([sp, t.moveX, t.moveY, +t.softX.toFixed(3), +t.softY.toFixed(3)]);
      m = t; if (B) { const sm = pol.forward(dnFromFeat(B, ft)); if (Math.random() >= beta) m = sm; } }
    g.update(m); f++;
  }
  seqs.push(seq); stats.push({ s, frames: f, kill: g.boss.hp <= 0, hits: g.player.totalHits });
}
fs.writeFileSync(out, JSON.stringify({ seqs, stats })); console.log(JSON.stringify(stats));
