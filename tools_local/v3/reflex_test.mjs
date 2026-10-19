import fs from 'fs'; import * as F3 from './fly.mjs';
const ck = process.argv[2], rp = process.argv[3] ? JSON.parse(process.argv[3]) : null, N = +(process.argv[4] || 30);
const B = F3.makeBrain(); const w = JSON.parse(fs.readFileSync(ck, 'utf8')).weights.slice(0, 320 + F3.NG3); const p = F3.setParams(B, rp ? [...w, ...rp] : w);
let F = 0, H = 0, NH = 0, E = 0; for (let s = 130000; s < 130000 + N; s++) { const r = F3.episode3(B, p, s, { mult: 1.6, tier: 2, dr: true, strict: true, lives: 3, cards: 5, repeat: 4, maxF: 1800 }); F += r.frames; H += r.hits; NH += r.hits === 0; E += r.edge / r.frames; }
console.log(JSON.stringify({ rp, surv: +(F / N / 60).toFixed(1), hits: +(H / N).toFixed(2), nohit: NH, edge: +(E / N).toFixed(2) }));
