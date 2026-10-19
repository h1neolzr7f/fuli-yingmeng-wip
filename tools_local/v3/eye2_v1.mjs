// Full-field retinotopic eye for slim2kMB. Features (len 775):
//  [0,320)   global grid 16 cols x 20 rows over the 460x580 arena: bullet density (count/2, clip 1)
//  [320,640) same grid: approach toward fly  = clip(approachSpeed/3,0,1) * (1 - dist/700)
//  [640,704) fovea 8x8, 12px cells centred on the fly: density
//  [704,768) fovea approach
//  [768,775) boss dx, boss dy(below boss +), boss dist, mean flow vx, vy, player x/W, y/H
// Cell mapping (959 LC/LPLC cells): each type tiles its field; hemisphere by soma x vs type median
// (right hemi -> right half of field), within hemi rows by soma y rank, columns by soma z rank.
// Each cell pools (max) over a rectangular receptive field = its tile (+1 cell overlap).
//  approach-global: LC4, LPLC1, LPLC4, LC16       (looming / approach)
//  approach-fovea : LPLC2                           (near collision)
//  density-fovea  : LC10a/b/c-1/c-2/d/e/_unclear    (small-object, near fly)
//  boss azimuth   : LC11 (population code, amp ~ proximity)
//  boss dx/dy     : LC9 (place codes)
//  proprio x/y    : LC21 (place codes)
//  flow           : LC17 (vertical, opponent), LC15 (horizontal, opponent)
//  density-global : all other LC types (~600 cells)
export const FEAT_LEN = 775; const GC = 16, GR = 20, FV = 8, FS = 12;
export function features(g) {
  const f = new Float32Array(FEAT_LEN), px = g.player.x, py = g.player.y, cw = g.width / GC, ch = g.height / GR; let fvx = 0, fvy = 0, n = 0;
  for (const b of g.bullets) {
    const c = Math.floor(b.x / cw), r = Math.floor(b.y / ch); const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy) || 1;
    const ap = Math.max(0, Math.min(1, -(dx * b.vx + dy * b.vy) / d / 3)) * Math.max(0, 1 - d / 700);
    if (c >= 0 && c < GC && r >= 0 && r < GR) { const i = r * GC + c; f[i] = Math.min(1, f[i] + 0.5); f[320 + i] = Math.max(f[320 + i], ap); }
    const fc = Math.floor(dx / FS + FV / 2), fr = Math.floor(dy / FS + FV / 2);
    if (fc >= 0 && fc < FV && fr >= 0 && fr < FV) { const i = fr * FV + fc; f[640 + i] = Math.min(1, f[640 + i] + 0.5); f[704 + i] = Math.max(f[704 + i], Math.max(0, Math.min(1, -(dx * b.vx + dy * b.vy) / d / 3))); }
    if (d < 200 && ap > 0) { fvx += b.vx; fvy += b.vy; n++; }
  }
  const bdx = g.boss.x - px, bdy = py - g.boss.y;
  f[768] = bdx; f[769] = bdy; f[770] = Math.hypot(bdx, bdy); f[771] = n ? fvx / n : 0; f[772] = n ? fvy / n : 0; f[773] = px / g.width; f[774] = py / g.height;
  return f;
}
const APG = new Set(['LC4', 'LPLC1', 'LPLC4', 'LC16']);
function tile(cells, N, cols, rows, base, stride) { // returns [cell, idxList]
  const out = []; const xs = cells.map(i => N[i].position[0]).sort((a, b) => a - b), mx = xs[xs.length >> 1];
  for (const [hemi, list] of [[1, cells.filter(i => N[i].position[0] >= mx)], [0, cells.filter(i => N[i].position[0] < mx)]]) {
    if (!list.length) continue; const hc = cols / 2; const r = Math.max(1, Math.round(Math.sqrt(list.length * rows / hc))), c = Math.ceil(list.length / r);
    const byY = [...list].sort((a, b) => N[a].position[1] - N[b].position[1]);
    for (let rr = 0; rr < r; rr++) { const row = byY.slice(rr * c, rr * c + c).sort((a, b) => N[a].position[2] - N[b].position[2]);
      row.forEach((cell, cc) => { const x0 = Math.floor(hemi * hc + cc * hc / c) - 1, x1 = Math.ceil(hemi * hc + (cc + 1) * hc / c) + 1, y0 = Math.floor(rr * rows / r) - 1, y1 = Math.ceil((rr + 1) * rows / r) + 1;
        const idx = []; for (let y = Math.max(0, y0); y < Math.min(rows, y1); y++) for (let x = Math.max(0, x0); x < Math.min(cols, x1); x++) idx.push(base + y * stride + x); out.push([cell, idx]); }); }
  }
  return out;
}
export function buildEye(graph) {
  const N = graph.nodes, byType = {};
  N.forEach((n, i) => { if (/^(LC|LPLC)/.test(n.type || '')) (byType[n.type] ||= []).push(i); });
  const pool = [], special = []; const stats = {};
  for (const [t, cells] of Object.entries(byType)) {
    let kind;
    if (t === 'LC11') { cells.forEach((c, k) => special.push([c, 'bossAz', k / cells.length * 2 * Math.PI])); kind = 'bossAz'; }
    else if (t === 'LC9') { cells.forEach((c, k) => special.push(k % 2 ? [c, 'bdy', 450 * ((k - 1) / 2) / 9] : [c, 'bdx', -230 + 460 * (k / 2) / 9])); kind = 'bossDxDy'; }
    else if (t === 'LC21') { cells.forEach((c, k) => special.push(k % 2 ? [c, 'py', ((k - 1) / 2) / 9] : [c, 'px', (k / 2) / 9])); kind = 'proprio'; }
    else if (t === 'LC17') { cells.forEach((c, k) => special.push([c, 'fy', k % 2 ? -1 : 1])); kind = 'flowY'; }
    else if (t === 'LC15') { cells.forEach((c, k) => special.push([c, 'fx', k % 2 ? -1 : 1])); kind = 'flowX'; }
    else if (APG.has(t)) { pool.push(...tile(cells, N, GC, GR, 320, GC)); kind = 'approachGlobal'; }
    else if (t === 'LPLC2') { pool.push(...tile(cells, N, FV, FV, 704, FV)); kind = 'approachFovea'; }
    else if (t.startsWith('LC10')) { pool.push(...tile(cells, N, FV, FV, 640, FV)); kind = 'densityFovea'; }
    else { pool.push(...tile(cells, N, GC, GR, 0, GC)); kind = 'densityGlobal'; }
    (stats[kind] ||= { types: 0, cells: 0 }); stats[kind].types++; stats[kind].cells += cells.length;
  }
  return { pool: pool.map(([c, idx]) => [c, Int32Array.from(idx)]), special, stats };
}
const gauss = (x, w) => Math.exp(-(x * x) / (2 * w * w));
export function eyeDrive(E, f, drive) {
  for (const [c, idx] of E.pool) { let v = 0; for (let j = 0; j < idx.length; j++) if (f[idx[j]] > v) v = f[idx[j]]; drive[c] = 2 * v; }
  const bdx = f[768], bdy = f[769], bd = f[770]; let ang = Math.atan2(bdx, -bdy); if (ang < 0) ang += 2 * Math.PI;
  for (const [c, k, p] of E.special) { let v = 0;
    if (k === 'bossAz') { let da = Math.abs(ang - p); da = Math.min(da, 2 * Math.PI - da); v = gauss(da, 0.35) * Math.max(0.2, 1 - bd / 600); }
    else if (k === 'bdx') v = gauss(bdx - p, 30); else if (k === 'bdy') v = gauss(bdy - p, 35);
    else if (k === 'fx') v = Math.max(0, p * f[771] / 3); else if (k === 'fy') v = Math.max(0, p * f[772] / 3);
    else if (k === 'px') v = gauss(f[773] - p, 0.08); else if (k === 'py') v = gauss(f[774] - p, 0.08);
    drive[c] = 2 * Math.min(1, v); }
}
