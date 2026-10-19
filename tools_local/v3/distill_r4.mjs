// states from an r4 (80-neuron) fly playing; labels = its continuous actions; stores v3 eye features. node distill_r4.mjs r4ckpt s0 n out
import fs from 'fs';
import { makeFly } from '../plastic/online.mjs';
import { makeGame } from '../cma/episode.mjs';
import { features } from './eye2.mjs';
const [ck, s0, n, out] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
const fly = makeFly(ck); for (let e = 0; e < fly.gain.length; e++) fly.brain.eWeight[e] = fly.base[e] * fly.gain[e];
const seqs = [];
for (let s = s0; s < s0 + n; s++) { fly.brain.reset(); const g = makeGame(s, { mult: 1.4, lives: 3, cards: 5, strict: true }); const seq = []; let f = 0, m = { moveX: 0, moveY: 0 };
  while (!g.player.isDead && f < 1800) { if (f % 4 === 0) { m = fly.pol.forward(fly.brain.step(g.getBiologicalSensoryInput(), false)); const ft = features(g); const sp = []; for (let i = 0; i < ft.length; i++) if (ft[i]) sp.push(i, +ft[i].toFixed(3)); seq.push([sp, +m.moveX.toFixed(3), +m.moveY.toFixed(3)]); } g.update(m); f++; }
  seqs.push(seq); }
fs.writeFileSync(out, JSON.stringify({ seqs }));
