// Distill scripted under-boss teacher into 320-param readout (supervised warm start only)
import fs from 'fs';
import { MaleCNSConnectome } from '../../src/brain/connectome.js';
import { ReadoutPolicy } from '../../src/brain/policy.js';
import { GRAPH, episode, teacherX } from './episode.mjs';
const o = { mult: 1.4, lives: 3, repeat: 1, cards: 5 };
const brain = new MaleCNSConnectome(GRAPH);
const data = [];
let tk = 0;
for (let s = 1; s <= 120; s++) { const r = episode(brain, null, 50000 + s, o, teacherX, data); if (r.kill) tk++; }
console.log('teacher kills', tk, '/120 samples', data.length);
// tiny MLP fit with Adam: h=tanh(W1 x), s=W2 h, mx=tanh(s1-s0), my=tanh(s3-s2)
let W = new Float64Array(320).map(() => (Math.random() - 0.5) * 0.3);
const init = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).weights : null;
if (init) W = Float64Array.from(init);
function fit(iters){const X = data.map(d => d[0]), Ymx = data.map(d => d[1]), Ymy = data.map(d => d[2]);
const m = new Float64Array(320), v = new Float64Array(320);
const lr = 0.01, B = 256;
for (let it = 1; it <= iters; it++) {
  const g = new Float64Array(320); let L = 0;
  for (let b = 0; b < B; b++) {
    const i = (Math.random() * X.length) | 0, x = X[i];
    const h = new Float64Array(16);
    for (let j = 0; j < 16; j++) { let z = 0; for (let k = 0; k < 16; k++) z += W[j * 16 + k] * x[k]; h[j] = Math.tanh(z); }
    const s = [0, 0, 0, 0]; for (let a = 0; a < 4; a++) for (let j = 0; j < 16; j++) s[a] += W[256 + a * 16 + j] * h[j];
    const mx = Math.tanh(s[1] - s[0]), my = Math.tanh(s[3] - s[2]);
    const ex = mx - Ymx[i], ey = my - Ymy[i]; L += ex * ex + ey * ey;
    const dx = 2 * ex * (1 - mx * mx), dy = 2 * ey * (1 - my * my);
    const ds = [-dx, dx, -dy, dy];
    const dh = new Float64Array(16);
    for (let a = 0; a < 4; a++) for (let j = 0; j < 16; j++) { g[256 + a * 16 + j] += ds[a] * h[j]; dh[j] += ds[a] * W[256 + a * 16 + j]; }
    for (let j = 0; j < 16; j++) { const dz = dh[j] * (1 - h[j] * h[j]); for (let k = 0; k < 16; k++) g[j * 16 + k] += dz * x[k]; }
  }
  for (let p = 0; p < 320; p++) { const gg = g[p] / B; m[p] = 0.9 * m[p] + 0.1 * gg; v[p] = 0.999 * v[p] + 0.001 * gg * gg; W[p] -= lr * (m[p] / (1 - 0.9 ** it)) / (Math.sqrt(v[p] / (1 - 0.999 ** it)) + 1e-8); }
  if (it % 1000 === 0) console.log('it', it, 'mse', (L / B).toFixed(4));
}}
fit(4000);
for (let dg = 1; dg <= 5; dg++) {
  const pol0 = new ReadoutPolicy(W);
  // student rollout, teacher labels
  for (let s = 1; s <= 60; s++) { brain.reset(); const gm = (await import('./episode.mjs')).makeGame(60000 + dg * 100 + s, o); let f = 0;
    while (!gm.player.isDead && f < 1800) { const dn = brain.step(gm.getBiologicalSensoryInput(), false); const t = teacherX(gm); data.push([Array.from(dn), t.moveX, t.moveY]); gm.update(pol0.forward(dn)); f++; } }
  fit(3000);
  let k = 0; const pol1 = new ReadoutPolicy(W); for (let s = 90001; s < 90101; s++) k += episode(brain, pol1, s, o).kill;
  console.log('DAgger', dg, 'samples', data.length, 'student kills/100', k);
}
fs.writeFileSync('public/data/checkpoint_distill.json', JSON.stringify({ weights: Array.from(W), note: 'distilled from scripted x-tracking teacher (warm start only)' }));
// quick check
const pol = new ReadoutPolicy(W); let k = 0, d = 0;
for (let s = 90001; s < 90201; s++) { const r = episode(brain, pol, s, o); k += r.kill; d += r.dmg; }
console.log('distilled student kills/200 =', k, 'avg dmg', (d / 200).toFixed(1));
let tk2 = 0; for (let s = 90001; s < 90201; s++) tk2 += episode(brain, null, s, o, teacherX).kill;
console.log('teacher kills/200 (same seeds) =', tk2);
