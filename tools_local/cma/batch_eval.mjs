// stdin JSON {cands:[[320]], seeds:[...], o:{...}} -> stdout JSON [{fit,kills,dmg,frames}]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'os';
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
  const { MaleCNSConnectome } = await import('../../src/brain/connectome.js');
  const { ReadoutPolicy } = await import('../../src/brain/policy.js');
  const { GRAPH, episode, fitnessOf } = await import('./episode.mjs');
  const brain = new MaleCNSConnectome(GRAPH); const { seeds, o } = workerData;
  // trainable synapse gains (topology fixed): edges whose post-synaptic cell is a DN
  const outs = new Set(brain.outputs); const gIdx = []; for (let e = 0; e < brain.ePost.length; e++) if (outs.has(brain.ePost[e])) gIdx.push(e);
  const base = Float64Array.from(brain.eWeight);
  const { applyGains: AG } = await import('./gains.mjs'); const applyGains = (w) => AG(brain, base, w.slice(320));
  parentPort.on('message', ({ i, w }) => { applyGains(w); const pol = new ReadoutPolicy(Float64Array.from(w.slice(0, 320)));
    let F = 0, K = 0, D = 0, FR = 0, DX = 0, GZ = 0, IM = 0, AL = 0; for (const s of seeds) { const r = episode(brain, pol, s, o); F += fitnessOf(r, o); K += r.kill; D += r.dmg; FR += r.frames; DX += r.dx; GZ += r.graze; IM += r.imse; AL += r.aligned; }
    parentPort.postMessage({ i, r: { fit: F / seeds.length, kills: K, dmg: D / seeds.length, frames: FR / seeds.length, dx: DX / seeds.length, graze: GZ / seeds.length, imse: IM / seeds.length, aligned: AL / seeds.length } }); });
}
