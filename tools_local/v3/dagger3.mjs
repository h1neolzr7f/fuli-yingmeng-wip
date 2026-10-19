// Dodge-DAgger: v3 fly plays; when a bullet is within NEAR px, the planner labels (and with prob beta executes) the action.
// Other moments are labelled with the fly's own action (keeps alignment). node dagger3.mjs ckpt s0 n out [beta]
import fs from 'fs';
import * as F3 from './fly.mjs';
import { features } from './eye2.mjs';
import { makeGame } from '../cma/episode.mjs';
import { plan } from '../expert/planner.mjs';
const [ck, s0, n, out, beta] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5], +(process.argv[6] ?? 0.5)];
const NEAR = +(process.env.NEAR || 60); const B = F3.makeBrain(); const pol = F3.setParams(B, JSON.parse(fs.readFileSync(ck, 'utf8')).weights);
const seqs = [], stats = []; let nearN = 0, tot = 0;
for (let s = s0; s < s0 + n; s++) { B.brain.reset(); const g = makeGame(s, { mult: 1.4, lives: 3, cards: 5, strict: true, dr: s % 2 === 1 }); const seq = []; let f = 0, m = { moveX: 0, moveY: 0 };
  while (!g.player.isDead && f < 1800) { if (f % 4 === 0) { const ft = features(g); const sm = pol.forward(F3.dnFromFeat(B, ft));
      let near = false; for (const b of g.bullets) if (Math.hypot(b.x - g.player.x, b.y - g.player.y) < NEAR) { near = true; break; }
      let lab = [+sm.moveX.toFixed(3), +sm.moveY.toFixed(3)]; m = sm;
      if (near) { const t = plan(g); lab = [t.moveX, t.moveY]; nearN++; if (Math.random() < beta) m = t; }
      tot++; const sp = []; for (let i = 0; i < ft.length; i++) if (ft[i]) sp.push(i, +ft[i].toFixed(3)); seq.push([sp, lab[0], lab[1], near ? 1 : 0]); }
    g.update(m); f++; }
  seqs.push(seq); stats.push({ s, frames: f, hits: g.player.totalHits }); }
fs.writeFileSync(out, JSON.stringify({ seqs, stats })); console.log('near frac', (nearN / tot).toFixed(3), JSON.stringify(stats));
