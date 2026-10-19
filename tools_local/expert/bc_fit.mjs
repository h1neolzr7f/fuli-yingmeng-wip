// node bc_fit.mjs flyCkpt out.json data1.json data2.json ... -> fits readout (320) by Adam MSE on planner labels, keeps fly gains
import fs from 'fs';
import { makeFly } from '../plastic/online.mjs';
import { ReadoutPolicy } from '../../src/brain/policy.js';
import { makeGame } from '../cma/episode.mjs';
const [ck, out, ...files] = process.argv.slice(2);
const full = JSON.parse(fs.readFileSync(ck, 'utf8')).weights;
let W = Float64Array.from(full.slice(0, 320)); const data = [];
for (const f of files) for (const d of JSON.parse(fs.readFileSync(f, 'utf8')).data) data.push(d);
console.log('samples', data.length);
function fit(iters, lr = 0.01, B = 512) { const m = new Float64Array(320), v = new Float64Array(320); let L = 0;
  for (let it = 1; it <= iters; it++) { const g = new Float64Array(320); L = 0;
    for (let b = 0; b < B; b++) { const [x, ymx, ymy] = data[(Math.random() * data.length) | 0]; const h = new Float64Array(16);
      for (let j = 0; j < 16; j++) { let z = 0; for (let k = 0; k < 16; k++) z += W[j * 16 + k] * x[k]; h[j] = Math.tanh(z); }
      const s = [0, 0, 0, 0]; for (let a = 0; a < 4; a++) for (let j = 0; j < 16; j++) s[a] += W[256 + a * 16 + j] * h[j];
      const mx = Math.tanh(s[1] - s[0]), my = Math.tanh(s[3] - s[2]); const ex = mx - ymx, ey = my - ymy; L += ex * ex + ey * ey;
      const dx = 2 * ex * (1 - mx * mx), dy = 2 * ey * (1 - my * my), ds = [-dx, dx, -dy, dy], dh = new Float64Array(16);
      for (let a = 0; a < 4; a++) for (let j = 0; j < 16; j++) { g[256 + a * 16 + j] += ds[a] * h[j]; dh[j] += ds[a] * W[256 + a * 16 + j]; }
      for (let j = 0; j < 16; j++) { const dz = dh[j] * (1 - h[j] * h[j]); for (let k = 0; k < 16; k++) g[j * 16 + k] += dz * x[k]; } }
    for (let p = 0; p < 320; p++) { const gg = g[p] / B; m[p] = 0.9 * m[p] + 0.1 * gg; v[p] = 0.999 * v[p] + 0.001 * gg * gg; W[p] -= lr * (m[p] / (1 - 0.9 ** it)) / (Math.sqrt(v[p] / (1 - 0.999 ** it)) + 1e-8); }
    if (it % 2000 === 0) console.log('it', it, 'mse', (L / B).toFixed(4)); } }
fit(8000);
const res = Array.from(W).concat(full.slice(320));
fs.writeFileSync(out, JSON.stringify({ weights: res, note: 'BC/DAgger from MPC planner teacher' }));
// quick student check, strict rules, full difficulty
const fly = makeFly(out); for (let e = 0; e < fly.gain.length; e++) fly.brain.eWeight[e] = fly.base[e] * fly.gain[e];
let K = 0, D = 0, F = 0, H = 0, Z = 0, DX = 0; const N = +(process.env.NCHK || 40);
for (let s = 90001; s < 90001 + N; s++) { fly.brain.reset(); const g = makeGame(s, { mult: 1.4, lives: 3, cards: 5, strict: true }); let f = 0, m = { moveX: 0, moveY: 0 };
  while (!g.player.isDead && f < 1800) { if (f % 4 === 0) m = fly.pol.forward(fly.brain.step(g.getBiologicalSensoryInput(), false)); g.update(m); f++; DX += Math.hypot(g.boss.x - g.player.x, g.player.y - g.boss.y); }
  K += g.boss.hp <= 0; D += g.boss.maxHp - Math.max(0, g.boss.hp); F += f; Z += g.player.graze; }
console.log('STUDENT', JSON.stringify({ kills: K + '/' + N, dmg: +(D / N).toFixed(1), frames: +(F / N).toFixed(0), graze: +(Z / N).toFixed(1), meanDistToBoss: +(DX / F).toFixed(0) }));
