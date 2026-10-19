// stdin {cands:[[320+NG]], files:[...], sub:k} -> @@RES@@ [mse...]  open-loop imitation of planner on recorded expert obs sequences
import fs from 'fs';
import { Worker, isMainThread, workerData, parentPort } from 'worker_threads';
import { MaleCNSConnectome } from '../../src/brain/connectome.js';
import { ReadoutPolicy } from '../../src/brain/policy.js';
import { GRAPH } from '../cma/episode.mjs';
import { applyGains } from '../cma/gains.mjs';
if (isMainThread) {
  let buf = ''; process.stdin.on('data', d => buf += d); process.stdin.on('end', async () => {
    const job = JSON.parse(buf); const W = Number(process.env.NW || 8); const res = new Array(job.cands.length); let next = 0, done = 0;
    await new Promise(resolve => { for (let w = 0; w < W; w++) { const wk = new Worker(new URL(import.meta.url), { workerData: { files: job.files, sub: job.sub || 1, off: job.off || 0 } });
      const feed = () => { if (next < job.cands.length) { const i = next++; wk.postMessage({ i, c: job.cands[i] }); } else wk.terminate(); };
      wk.on('message', m => { if (m.ready) return feed(); res[m.i] = m.r; if (++done === job.cands.length) resolve(); feed(); }); } });
    process.stdout.write('@@RES@@' + JSON.stringify(res));
  });
} else {
  const brain = new MaleCNSConnectome(GRAPH); const base = Float64Array.from(brain.eWeight);
  let seqs = []; for (const f of workerData.files) seqs.push(...JSON.parse(fs.readFileSync(f, 'utf8')).seqs);
  seqs = seqs.filter((_, i) => i % workerData.sub === workerData.off % workerData.sub);
  parentPort.on('message', ({ i, c }) => {
    applyGains(brain, base, c.slice(320)); const pol = new ReadoutPolicy(Float64Array.from(c.slice(0, 320)));
    let L = 0, n = 0, agree = 0;
    for (const sq of seqs) { brain.reset(); for (const [ob, tx, ty] of sq) { const m = pol.forward(brain.step(ob, false)); L += (m.moveX - tx) ** 2 + (m.moveY - ty) ** 2; n++; if (Math.sign(Math.round(m.moveX)) === tx && Math.sign(Math.round(m.moveY)) === ty) agree++; } }
    parentPort.postMessage({ i, r: { mse: L / n, agree: agree / n } });
  });
  parentPort.postMessage({ ready: 1 });
}
