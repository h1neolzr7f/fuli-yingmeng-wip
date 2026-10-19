// BC of readout on rich-eye slim brain. node bc3.mjs out.json init.json|none valFile file1 file2 ...
import fs from 'fs';
import { makeBrain, setParams, dnFromFeat } from './fly.mjs';
import { FEAT_LEN } from './eye2.mjs';
const dense = sp => { const f = new Float32Array(FEAT_LEN); for (let i = 0; i < sp.length; i += 2) f[sp[i]] = sp[i + 1]; return f; };
const [out, init, val, ...files] = process.argv.slice(2);
const B = makeBrain(); let w0 = init !== 'none' ? JSON.parse(fs.readFileSync(init, 'utf8')).weights : new Array(320).fill(0).map(() => (Math.random() - 0.5) * 0.3);
setParams(B, w0);
const load = fl => { const D = []; for (const f of fl) for (const sq of JSON.parse(fs.readFileSync(f, 'utf8')).seqs) { B.brain.reset(); for (const q of sq) { const soft = process.env.SOFT === '1' && q.length > 3; D.push([Float64Array.from(dnFromFeat(B, dense(q[0]))), soft ? q[3] : q[1], soft ? q[4] : q[2], q[1], q[2]]); } } return D; };
const data = load(files), vdata = load([val]); console.log('train', data.length, 'val', vdata.length);
let W = Float64Array.from(w0.slice(0, 320));
const fwd = x => { const h = new Float64Array(16); for (let j = 0; j < 16; j++) { let z = 0; for (let k = 0; k < 16; k++) z += W[j * 16 + k] * x[k]; h[j] = Math.tanh(z); }
  const s = [0, 0, 0, 0]; for (let a = 0; a < 4; a++) for (let j = 0; j < 16; j++) s[a] += W[256 + a * 16 + j] * h[j]; return { h, s, mx: Math.tanh(s[1] - s[0]), my: Math.tanh(s[3] - s[2]) }; };
const metric = D => { let L = 0, A = 0; for (const [x, tx, ty, hx, hy] of D) { const { mx, my } = fwd(x); L += (mx - tx) ** 2 + (my - ty) ** 2; if (Math.sign(Math.round(mx)) === hx && Math.sign(Math.round(my)) === hy) A++; } return { mse: +(L / D.length).toFixed(4), agree: +(A / D.length).toFixed(3) }; };
const m = new Float64Array(320), v = new Float64Array(320);
for (let it = 1; it <= 12000; it++) { const g = new Float64Array(320); const B_ = 512;
  for (let b = 0; b < B_; b++) { const [x, ymx, ymy] = data[(Math.random() * data.length) | 0]; const { h, mx, my } = fwd(x);
    const ex = mx - ymx, ey = my - ymy, dx = 2 * ex * (1 - mx * mx), dy = 2 * ey * (1 - my * my), ds = [-dx, dx, -dy, dy], dh = new Float64Array(16);
    for (let a = 0; a < 4; a++) for (let j = 0; j < 16; j++) { g[256 + a * 16 + j] += ds[a] * h[j]; dh[j] += ds[a] * W[256 + a * 16 + j]; }
    for (let j = 0; j < 16; j++) { const dz = dh[j] * (1 - h[j] * h[j]); for (let k = 0; k < 16; k++) g[j * 16 + k] += dz * x[k]; } }
  for (let p = 0; p < 320; p++) { const gg = g[p] / B_; m[p] = 0.9 * m[p] + 0.1 * gg; v[p] = 0.999 * v[p] + 0.001 * gg * gg; W[p] -= 0.01 * (m[p] / (1 - 0.9 ** it)) / (Math.sqrt(v[p] / (1 - 0.999 ** it)) + 1e-8); }
  if (it % 3000 === 0) console.log('it', it, 'train', JSON.stringify(metric(data.slice(0, 20000))), 'val', JSON.stringify(metric(vdata))); }
const wout = Array.from(W).concat(w0.length > 320 ? w0.slice(320) : []);
fs.writeFileSync(out, JSON.stringify({ weights: wout, note: 'v3 BC readout (slim2kMB + rich eye) from MPC planner' }));
console.log('FINAL val', JSON.stringify(metric(vdata)));
