// dump brain activity (56 DNs + central non-visual cells) under planner-labelled sequences. node probe_dump.mjs ckpt out.bin files...
import fs from 'fs'; import * as F3 from './fly.mjs'; import { FEAT_LEN } from './eye2.mjs';
const [ck, out, ...files] = process.argv.slice(2); const B = F3.makeBrain(); F3.setParams(B, JSON.parse(fs.readFileSync(ck,'utf8')).weights);
const N = F3.GRAPH3.nodes; const dn = [], cen = [];
N.forEach((n,i)=>{ if (n.superclass==='descending_neuron') dn.push(i); else if (n.superclass==='cb_intrinsic') cen.push(i); });
const idx = [...dn, ...cen]; const rows = []; let labs = [];
for (const f of files) for (const sq of JSON.parse(fs.readFileSync(f,'utf8')).seqs) { B.brain.reset();
  for (const q of sq) { const ft = new Float32Array(FEAT_LEN); const sp=q[0]; for (let i=0;i<sp.length;i+=2) ft[sp[i]]=sp[i+1];
    F3.dnFromFeat(B, ft); const a = B.brain.activity; rows.push(Float32Array.from(idx, i=>a[i])); labs.push(Math.sign(q[1])+1 + 3*(Math.sign(q[2])+1)); } }
const M = new Float32Array(rows.length*idx.length); rows.forEach((r,k)=>M.set(r,k*idx.length));
fs.writeFileSync(out, Buffer.from(M.buffer)); fs.writeFileSync(out+'.json', JSON.stringify({n:rows.length, d:idx.length, ndn:dn.length, labs}));
console.log(rows.length, idx.length, dn.length);
