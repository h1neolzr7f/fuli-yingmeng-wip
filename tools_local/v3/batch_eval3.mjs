// v3 evaluator: stdin JSON {cands,seeds,o}; emits aggregate survival metrics per candidate.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { readFileSync } from "fs";
if (isMainThread) {
  let buf = "";
  process.stdin.on("data", d => buf += d);
  process.stdin.on("end", async () => {
    const job = JSON.parse(buf);
    if (job.o && job.o.mult >= 1.4 && !job.o.bossHp && process.env.NODR !== "1") job.o.dr = 1;
    const W = Number(process.env.NW || 7);
    const res = new Array(job.cands.length);
    let next = 0, done = 0;
    await new Promise(resolve => {
      for (let w = 0; w < W; w++) {
        const wk = new Worker(new URL(import.meta.url), { workerData: { seeds: job.seeds, o: job.o } });
        const feed = () => {
          if (next < job.cands.length) {
            const i = next++;
            wk.postMessage({ i, w: job.cands[i] });
          } else wk.terminate();
        };
        wk.on("message", m => {
          res[m.i] = m.r;
          done++;
          if (done === job.cands.length) resolve();
          feed();
        });
        feed();
      }
    });
    process.stdout.write("\n@@RES@@" + JSON.stringify(res));
  });
} else {
  const { fitnessOf } = await import("../cma/episode.mjs");
  const F3 = await import("../v3/fly.mjs");
  const B = F3.makeBrain();
  const { seeds, o } = workerData;
  const frozenG = process.env.FROZEN_GAINS
    ? JSON.parse(readFileSync(process.env.FROZEN_GAINS, "utf8")).weights.slice(320)
    : null;
  parentPort.on("message", ({ i, w }) => {
    let ww = w;
    if (frozenG) {
      const candidate = Array.from(w);
      const frozen = Array.from(frozenG);
      const reflexN = process.env.REFLEX === "1" ? 7 : 0;
      const frozenGainEnd = Math.max(0, frozen.length - reflexN);
      ww = candidate.slice(0, 320).concat(
        frozen.slice(0, frozenGainEnd),
        reflexN ? candidate.slice(-reflexN) : []
      );
    }
    const pol = F3.setParams(B, ww);
    let F = 0, K = 0, D = 0, FR = 0, DX = 0, GZ = 0, IM = 0, AL = 0;
    let H = 0, NH = 0, EDGE = 0, DANGER = 0;
    for (const s of seeds) {
      const r = F3.episode3(B, pol, s, o);
      F += fitnessOf(r, o);
      K += r.kill ? 1 : 0;
      D += r.dmg;
      FR += r.frames;
      DX += r.dx;
      GZ += r.graze;
      IM += r.imse;
      AL += r.aligned;
      H += r.hits;
      if (r.hits === 0) NH++;
      EDGE += r.frames > 0 ? r.edge / r.frames : 1;
      DANGER += r.danger || 0;
    }
    const n = Math.max(1, seeds.length);
    parentPort.postMessage({
      i,
      r: {
        fit: F / n, kills: K, bossKills: K, noHitRate: NH / n,
        meanHits: H / n, edgeFrac: EDGE / n, meanDanger: DANGER / n,
        dmg: D / n, frames: FR / n, meanFrames: FR / n, dx: DX / n,
        graze: GZ / n, meanGraze: GZ / n, imse: IM / n, aligned: AL / n,
      },
    });
  });
}
