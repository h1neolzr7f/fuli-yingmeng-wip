// node gen.mjs flyCkpt seedStart n out.json [studentWeights.json beta]
// Records (DN activity of the fly brain incl. its gains, planner label). With student weights: DAgger,
// the executed action is student's with prob 1-beta (planner labels every visited state).
import fs from 'fs';
import { makeFly } from '../plastic/online.mjs';
import { ReadoutPolicy } from '../../src/brain/policy.js';
import { makeGame } from '../cma/episode.mjs';
import { plan } from './planner.mjs';
const [ck, s0, n, out, sw, beta] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5], process.argv[6], +(process.argv[7] ?? 0)];
const fly = makeFly(ck); for (let e = 0; e < fly.gain.length; e++) fly.brain.eWeight[e] = fly.base[e] * fly.gain[e];
const stu = sw ? new ReadoutPolicy(Float64Array.from(JSON.parse(fs.readFileSync(sw, 'utf8')).weights.slice(0, 320))) : null;
const data = [], stats = [], seqs = [];
for (let s = s0; s < s0 + n; s++) {
  fly.brain.reset(); const seq = []; seqs.push(seq); const g = makeGame(s, { mult: 1.4, lives: 3, cards: 5, strict: true }); let f = 0, m = { moveX: 0, moveY: 0 };
  while (!g.player.isDead && f < 1800) {
    if (f % 4 === 0) { const ob = g.getBiologicalSensoryInput(); const dn = Array.from(fly.brain.step(ob, false)); const t = plan(g); seq.push([Array.from(ob, v => +v.toFixed(4)), t.moveX, t.moveY]); data.push([dn.map(v => +v.toFixed(5)), t.moveX, t.moveY]);
      m = stu && Math.random() >= beta ? stu.forward(dn) : t; }
    g.update(m); f++;
  }
  stats.push({ s, frames: f, kill: g.boss.hp <= 0, hits: g.player.totalHits, graze: g.player.graze });
}
fs.writeFileSync(out, JSON.stringify({ data, stats, seqs })); console.log(JSON.stringify(stats));
