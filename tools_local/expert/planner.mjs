// Deterministic lookahead (MPC) expert over our simulator. Target style: mid distance under boss,
// grazes without hits, damage, kill. Exports cloneGame + plan(); CLI dumps trajectories.
import { makeGame } from '../cma/episode.mjs';
const SKIP = new Set(['canvas', 'ctx', 'audioCtx', 'particles', 'cherryParticles']);
export function cloneDeep(o, map = new Map()) {
  if (o === null || typeof o !== 'object') return o;
  if (map.has(o)) return map.get(o);
  if (ArrayBuffer.isView(o)) { const c = o.slice(); map.set(o, c); return c; }
  if (Array.isArray(o)) { const c = new Array(o.length); map.set(o, c); for (let i = 0; i < o.length; i++) c[i] = cloneDeep(o[i], map); return c; }
  if (o instanceof Map || o instanceof Set || (typeof AudioContext !== 'undefined' && o instanceof AudioContext)) return o;
  const c = Object.create(Object.getPrototypeOf(o)); map.set(o, c);
  for (const k of Object.keys(o)) c[k] = SKIP.has(k) ? (Array.isArray(o[k]) ? [] : o[k]) : cloneDeep(o[k], map);
  return c;
}
export const ACTS = []; for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) ACTS.push({ moveX: x, moveY: y });
export const P = { band0: 120, band1: 220, dmin: 100, wHit: 5000, wBand: 1.0, wDx: 0.03, wClose: 3, wGraze: 6, wDmg: 4, wKill: 3000, seg: 8, horizon: 40 };
if (process.env.PLAN_MODE === 'survive') Object.assign(P, { wBand: 0, wDx: 0, wClose: 0, wDmg: 0, wKill: 0, wGraze: 4, wCenter: 0.02 });
function track(g) { const dx = g.boss.x - g.player.x, dy = (g.player.y - g.boss.y) - (P.band0 + P.band1) / 2; return { moveX: Math.max(-1, Math.min(1, dx / 10)), moveY: Math.max(-1, Math.min(1, -dy / 10)) }; }
export function rollout(g0, a1, mode) {
  const g = cloneDeep(g0); let c = 0; const h0 = g.player.totalHits, z0 = g.player.graze, hp0 = g.boss.hp;
  for (let t = 0; t < P.horizon && !g.player.isDead; t++) {
    const a = t < P.seg ? a1 : mode === 0 ? a1 : mode === 1 ? track(g) : { moveX: 0, moveY: 0 };
    g.update(a);
    const adx = Math.abs(g.boss.x - g.player.x), ddy = g.player.y - g.boss.y, disc = 1 - t / (2 * P.horizon);
    if (ddy >= P.band0 && ddy <= P.band1) c += P.wBand * disc;
    c -= P.wDx * adx * disc;
    if (Math.hypot(adx, ddy) < P.dmin) c -= P.wClose * disc;
    if (P.wCenter) c -= P.wCenter * (Math.abs(g.player.x - g.width / 2) + Math.abs(g.player.y - g.height * 0.7)) / 10 * disc;
  }
  c -= P.wHit * (g.player.totalHits - h0) + (g.player.isDead ? 20000 : 0);
  c += P.wGraze * (g.player.graze - z0) + P.wDmg * (hp0 - Math.max(0, g.boss.hp)) + (hp0 > 0 && g.boss.hp <= 0 ? P.wKill : 0);
  return c;
}
export function plan(g) {
  let best = -Infinity, ba = ACTS[4];
  for (const a of ACTS) { let v = -Infinity; for (const m of [0, 1, 2]) v = Math.max(v, rollout(g, a, m)); if (v > best) { best = v; ba = a; } }
  return ba;
}
export function planSoft(g, T = +(process.env.SOFT_T || 300)) {
  const vals = ACTS.map(a => Math.max(rollout(g, a, 0), rollout(g, a, 1), rollout(g, a, 2)));
  const mx = Math.max(...vals); let Z = 0, ex = 0, ey = 0;
  vals.forEach((v, i) => { const w = Math.exp((v - mx) / T); Z += w; ex += w * ACTS[i].moveX; ey += w * ACTS[i].moveY; });
  const bi = vals.indexOf(mx); return { moveX: ACTS[bi].moveX, moveY: ACTS[bi].moveY, softX: ex / Z, softY: ey / Z };
}
export function expertEpisode(seed, o, onDecision) {
  const g = makeGame(seed, o); const rep = o.repeat || 4; let f = 0, m = ACTS[4], kf = 0;
  while (!g.player.isDead && f < 1800) {
    if (f % rep === 0) { const obs = g.getBiologicalSensoryInput(); m = plan(g); if (onDecision) onDecision(g, obs, m, f); }
    g.update(m); f++; if (!kf && g.boss.hp <= 0) kf = f;
  }
  return { frames: f, kill: kf > 0, kf, dmg: g.boss.maxHp - Math.max(0, g.boss.hp), score: g.player.score, graze: g.player.graze, hits: g.player.totalHits, iframeGrazes: g.iframeGrazes };
}
if (process.argv[1].endsWith('planner.mjs')) {
  // determinism test then quick eval
  const g = makeGame(77, { mult: 1.4, lives: 3, strict: true }); for (let i = 0; i < 300; i++) g.update({ moveX: Math.sin(i / 20), moveY: 0 });
  const c = cloneDeep(g); for (let i = 0; i < 200; i++) { g.update({ moveX: 1, moveY: -0.5 }); c.update({ moveX: 1, moveY: -0.5 }); }
  console.log('determinism', g.player.x === c.player.x && g.bullets.length === c.bullets.length && g.boss.hp === c.boss.hp && g.seed === c.seed, g.bullets.length, g.boss.hp);
  const s0 = +process.argv[2] || 1, n = +process.argv[3] || 2; const t = Date.now();
  for (let s = s0; s < s0 + n; s++) console.log(JSON.stringify({ seed: s, ...expertEpisode(s, { mult: 1.4, lives: 3, cards: 5, strict: true, repeat: 4 }) }), ((Date.now() - t) / 1000).toFixed(1) + 's');
}
