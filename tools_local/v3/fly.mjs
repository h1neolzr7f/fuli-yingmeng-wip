// v3 fly: slim 2k MB connectome + rich eye + 320 readout + gains on (edges into 16 DNs) U (edges out of input cells)
import fs from 'fs';
import { MaleCNSConnectome } from '../../src/brain/connectome.js';
import { ReadoutPolicy } from '../../src/brain/policy.js';
import { makeGame } from '../cma/episode.mjs';
import { buildEye, eyeDrive, features } from './eye2.mjs';
export const GRAPH3 = JSON.parse(fs.readFileSync(new URL('../../public/data/connectome/graphSlim2kMB.json', import.meta.url), 'utf8'));
export function makeBrain() {
  const brain = new MaleCNSConnectome(GRAPH3); const base = Float64Array.from(brain.eWeight);
  const plan = buildEye(GRAPH3); const outs = new Set(brain.outputs), ins = new Set([...plan.pool.map(x => x[0]), ...plan.special.map(x => x[0])]);
  const gidx = []; for (let e = 0; e < brain.ePost.length; e++) if (outs.has(brain.ePost[e]) || ins.has(brain.ePre[e])) gidx.push(e);
  brain.extDrive = new Float64Array(brain.count); brain.extCells = [...ins];
  return { brain, base, gidx: Int32Array.from(gidx), plan };
}
export const NG3 = makeBrain().gidx.length;
export function setParams(B, w) {
  B.brain.eWeight.set(B.base); const g = w.length > 320 ? w.slice(320) : null;
  if (g) for (let j = 0; j < B.gidx.length; j++) { const e = B.gidx[j]; B.brain.eWeight[e] = B.base[e] * Math.max(0, Math.min(4, 1 + g[j])); }
  B.rp = w.length > 320 + NG3 ? Array.from(w.slice(320 + NG3, 320 + NG3 + 7)) : null;
  return new ReadoutPolicy(Float64Array.from(w.slice(0, 320)));
}
export function dnFromFeat(B, f) { eyeDrive(B.plan, f, B.brain.extDrive); return B.brain.step([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], false); }
// LPLC2/giant-fiber-like escape reflex: fovea looming (TTC, approach*density, density) -> repulsion + veto of motion toward threat.
export const RDEF = [1, 0.5, 0.3, 20, 1.5, 1];
export function reflex(ft, m, rp, pos) { const [a, b, c, lam, k, v] = rp; const kc = rp[6] || 0; let rx = 0, ry = 0;
  for (let fr = 0; fr < 8; fr++) for (let fc = 0; fc < 8; fc++) { const i = fr * 8 + fc; const L = a * ft[1095 + i] + b * ft[704 + i] * ft[640 + i] + c * ft[640 + i]; if (!L) continue;
    const dx = (fc - 3.5) * 12, dy = (fr - 3.5) * 12, d = Math.hypot(dx, dy); const w = L * Math.exp(-d / Math.max(1, lam)); rx -= w * dx / d; ry -= w * dy / d; }
  let mx = m.moveX, my = m.moveY; const n = Math.hypot(rx, ry);
  if (n > 1e-6) { const ux = -rx / n, uy = -ry / n, comp = mx * ux + my * uy; if (comp > 0) { const vv = Math.min(1, v * Math.min(1, n)); mx -= vv * comp * ux; my -= vv * comp * uy; } mx += k * rx; my += k * ry;
    if (kc && pos) { mx += kc * Math.min(1, n) * (0.5 - pos[0]) * 2; my += kc * Math.min(1, n) * (0.7 - pos[1]) * 2; } }
  return { moveX: Math.max(-1, Math.min(1, mx)), moveY: Math.max(-1, Math.min(1, my)), rmag: n };
}
const REFLEX = process.env.REFLEX === '1';
const FOCUS = process.env.FOCUS === '1', FOCUS_T = +(process.env.FOCUS_T || 0);
export function episode3(B, pol, seed, o, plannerFn = null) {
  B.brain.reset(); const g = makeGame(seed, o); const rep = o.repeat || 4, maxF = o.maxF || 1800;
  let f = 0, kf = 0, m = { moveX: 0, moveY: 0 }, sdx = 0, al = 0, band = 0, close = 0, dxpen = 0, far = 0, edge = 0, danger = 0;
  while (!g.player.isDead && f < maxF) {
    if (f % rep === 0) { const ft = features(g); const dn = dnFromFeat(B, ft); m = plannerFn ? plannerFn(g) : pol.forward(dn); if (REFLEX && !plannerFn) m = reflex(ft, m, B.rp || RDEF, [g.player.x / g.width, g.player.y / g.height]); if (FOCUS && !plannerFn) { const sc = m.scores; m = { moveX: m.moveX, moveY: m.moveY, focusMode: (sc[0] + sc[1] + sc[2] + sc[3]) > FOCUS_T }; } }
    g.update(m); f++; if (!kf && g.boss.hp <= 0) kf = f;
    const adx = Math.abs(g.boss.x - g.player.x), ddy = g.player.y - g.boss.y; sdx += adx; if (adx < 20) al++;
    if (adx < 35 && ddy >= 120 && ddy <= 260) band++; if (Math.hypot(adx, ddy) < 100) close++;
    dxpen += Math.max(0, adx - 40) / 100; if (ddy > 330) far++;
    { const px = g.player.x, py = g.player.y; for (const b of g.bullets) { const ddx = b.x - px, ddy2 = b.y - py; if (ddx > 48 || ddx < -48 || ddy2 > 48 || ddy2 < -48) continue; const d = Math.hypot(ddx, ddy2); if (d < 48) { const ap = -(ddx * (b.vx || 0) + ddy2 * (b.vy || 0)) > 0 ? 1.5 : 1; danger += ap * (1 - d / 48) ** 2; } } }
    if (g.player.y > g.height - 70 || g.player.x < 35 || g.player.x > g.width - 35 || g.player.y < 150) edge++;
  }
  const dmg = g.boss.maxHp - Math.max(0, g.boss.hp);
  return { frames: f, dx: sdx / f, aligned: al, imse: 0, dmg, dmgFrac: dmg / g.boss.maxHp, kill: kf > 0, kf, score: g.player.score, graze: g.player.graze, band, close, dxpen, far, edge, hits: g.player.totalHits, danger };
}
