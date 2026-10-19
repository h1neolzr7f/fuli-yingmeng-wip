import { spawnSync } from "node:child_process";
import fs from "node:fs";

const checkpointPath = "checkpoints_key/HR3_latest.json";
const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
if (!Array.isArray(checkpoint.weights) || checkpoint.weights.length !== 9179) {
  throw new Error("Expected HR3 checkpoint with 9,179 parameters");
}

const input = JSON.stringify({
  cands: [checkpoint.weights],
  seeds: [123456],
  o: {
    mult: 1.6, tier: 2, maxF: 120, strict: 1, survive: 1,
    HW: 1500, GW: 1, GCAP: 300, EW: 3, NHB: 15000,
    lives: 3, repeat: 4, cards: 5
  }
});
const run = spawnSync(process.execPath, ["tools_local/v3/batch_eval3.mjs"], {
  cwd: process.cwd(),
  input,
  encoding: "utf8",
  env: { ...process.env, REFLEX: "1", NW: "1" },
  timeout: 120000
});
if (run.error) throw run.error;
if (run.status !== 0 || !run.stdout.includes("@@RES@@")) {
  throw new Error("v3 smoke evaluation failed: " + (run.stderr || run.stdout).slice(-3000));
}
const marker = run.stdout.lastIndexOf("@@RES@@");
const rows = JSON.parse(run.stdout.slice(marker + "@@RES@@".length));
if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Expected one candidate result");
const m = rows[0];
for (const key of ["fit", "noHitRate", "meanHits", "edgeFrac", "meanFrames", "bossKills"]) {
  if (!Number.isFinite(m[key])) throw new Error("Missing/non-finite evaluator metric: " + key);
}
if (m.noHitRate < 0 || m.noHitRate > 1 || m.edgeFrac < 0 || m.edgeFrac > 1) {
  throw new Error("Rate metrics must be within [0, 1]");
}
console.log("v3 smoke evaluation passed", JSON.stringify({
  params: checkpoint.weights.length,
  frames: m.meanFrames,
  noHitRate: m.noHitRate,
  edgeFrac: m.edgeFrac,
  meanHits: m.meanHits
}));
