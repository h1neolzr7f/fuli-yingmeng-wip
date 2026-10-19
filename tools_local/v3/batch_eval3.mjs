// v3 (slim2kMB + full-field eye). stdin JSON {cands:[[320]], seeds:[...], o:{...}} -> stdout JSON [{fit,kills,dmg,frames}]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'fs';
if (isMainThread) {
  let buf = ''; process.stdin.on('data', d => buf += d); process.stdin.on('end', async () => {
    const job = JSON.parse(buf); if (job.o && job.o.mult >= 1.4 && !job.o.bossHp && process.env.NODR !== "1") job.o.dr = 1; const W = Number(process.env.NW || 7);
    const res = new Array(job.cands.length); let next = 0, done = 0;
    await new Promise(resolve => { for (let w = 0; w < W; w++) { const wk = new Worker(new URL(import.meta.url), { workerData: { seeds: job.seeds, o: job.o } });
      const feed = () => { if (next < job.cands.length) { const i = next++; wk.postMessage({ i, w: job.cands[i] }); } else wk.terminate(); };
      wk.on('message', m => { res[m.i] = m.r; done++; if (done === job.cands.length) resolve(); feed(); }); feed(); } });
    process.stdout.write("\n@@RES@@" + JSON.stringify(res));
  });
} else {
  const { fitnessOf } = await import("../cma/episode.mjs"); const F3 = await import("../v3/fly.mjs");
  const B = F3.makeBrain(); const { seeds, o } = workerData;
  const frozenG = process.env.FROZEN_GAINS ? JSON.parse(readFileSync(process.env.FROZEN_GAINS, 'utf8')).weights.slice(320) : null;
  parentPort.on('message', ({ i, w }) => {
    const ww = frozenG ? Array.from(w).slice(0, 320).concat(Array.from(frozenG)) : w;
    const pol = F3.setParams(B, ww);
    let F = 0, K = 0, D = 0, FR = 0, DX = 0, GZ = 0, IM = 0, AL = 0; for (const s of seeds) { const r = F3.episode3(B, pol, s, o); F += fitnessOf(r, o); K += r.kill; D += r.dmg; FR += r.frames; DX += r.dx; GZ += r.graze; IM += r.imse; AL += r.aligned; }
    parentPort.postMessage({ i, r: { fit: F / seeds.length, kills: K, dmg: D / seeds.length, frames: FR / seeds.length, dx: DX / seeds.length, graze: GZ / seeds.length, imse: IM / seeds.length, aligned: AL / seeds.length } }); });
}
