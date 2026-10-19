// Richer compound eye for the slim 2k MB connectome. Mapping (by cell type + retinotopy proxy):
//  LC4   (22): NEAR ring (<70px) looming per 16 azimuth sectors     -- classic looming / escape
//  LPLC2 (20): FAR ring (70-180px) time-to-contact per sector      -- collision anticipation
//  LC15  (20): rear-hemifield bullet density (8 rear-ish sectors x2) -- as v1 rear threat, retinotopic
//  LC11  (20): boss azimuth population code (20 bins over 360deg), amplitude ~ proximity  -- small object
//  LC9   (20): boss horizontal offset dx place code (-230..230 px) + vertical offset dy place code (0..450) split 10/10
//  LC16  (20): horizontal optic flow (opponent: half +vx, half -vx)
//  LC17  (20): vertical optic flow (half +vy, half -vy)
//  LC21  (20): proprioception place code: 10 cells on x, 10 on y
// Retinotopy proxy: within each type, cells are split into hemisphere by soma x vs type median
// (right hemisphere -> right-side sectors), then ordered by dorsoventral position (y) to fill sectors.
// Drive = 2*value (0..2), injected in place of the 8-channel drive for input cells.
export const FEAT_LEN = 16 + 16 + 3 + 2 + 2 + 3;
export function features(g) {
  const px = g.player.x, py = g.player.y, near = new Float32Array(16), far = new Float32Array(16); let fvx = 0, fvy = 0, n = 0;
  for (const b of g.bullets) {
    const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy); if (d > 180 || d < 0.5) continue;
    const appr = -(dx * b.vx + dy * b.vy) / d; let a = Math.atan2(dx, -dy); if (a < 0) a += 2 * Math.PI; const s = Math.floor(a / (2 * Math.PI) * 16) % 16;
    if (d < 70) near[s] = Math.max(near[s], Math.min(1, (70 - d) / 70 * (0.6 + 0.4 * Math.max(0, appr) / 3) + 0.15));
    else { const ttc = appr > 0.05 ? (d - 4) / appr : 999; far[s] = Math.max(far[s], Math.max(0, 1 - ttc / 60)); }
    if (appr > 0) { fvx += b.vx; fvy += b.vy; n++; }
  }
  const bdx = g.boss.x - px, bdy = py - g.boss.y;
  return [...near, ...far, bdx, bdy, Math.hypot(bdx, bdy), n ? fvx / n : 0, n ? fvy / n : 0, px / g.width, py / g.height, 0, 0, 0].slice(0, FEAT_LEN);
}
export function buildEye(graph) {
  const N = graph.nodes, ch = graph.channels; const byType = {};
  for (const [i, c] of graph.inputs) (byType[ch[c]] ||= []).push(i);
  const plan = []; // [cell, kind, param]
  for (const [t, cells] of Object.entries(byType)) {
    const mx = cells.map(i => N[i].position[0]).sort((a, b) => a - b)[cells.length >> 1];
    const R = cells.filter(i => N[i].position[0] >= mx).sort((a, b) => N[a].position[1] - N[b].position[1]);
    const L = cells.filter(i => N[i].position[0] < mx).sort((a, b) => N[a].position[1] - N[b].position[1]);
    const ordered = [...R, ...L]; // right hemi -> sectors 0..7 (right side, top->bottom), left -> 8..15
    ordered.forEach((cell, k) => {
      const u = k / ordered.length; // 0..1 around the eye
      if (t === 'LC4') plan.push([cell, 'near', Math.floor(u * 16) % 16]);
      else if (t === 'LPLC2') plan.push([cell, 'far', Math.floor(u * 16) % 16]);
      else if (t === 'LC15') plan.push([cell, 'rear', 4 + Math.floor(u * 8) % 8]);
      else if (t === 'LC11') plan.push([cell, 'bossAz', u * 2 * Math.PI]);
      else if (t === 'LC9') plan.push(k % 2 === 0 ? [cell, 'bdx', -230 + 460 * (k / 2) / (Math.ceil(ordered.length / 2) - 1 || 1)] : [cell, 'bdy', 450 * ((k - 1) / 2) / (Math.floor(ordered.length / 2) - 1 || 1)]);
      else if (t === 'LC16') plan.push([cell, 'fx', k % 2 ? -1 : 1]);
      else if (t === 'LC17') plan.push([cell, 'fy', k % 2 ? -1 : 1]);
      else if (t === 'LC21') plan.push(k % 2 === 0 ? [cell, 'px', (k / 2) / 9] : [cell, 'py', ((k - 1) / 2) / 9]);
    });
  }
  return plan;
}
const gauss = (x, w) => Math.exp(-(x * x) / (2 * w * w));
export function eyeDrive(plan, f, drive) {
  const bdx = f[32], bdy = f[33], bd = f[34], ang = Math.atan2(bdx, -bdy) < 0 ? Math.atan2(bdx, -bdy) + 2 * Math.PI : Math.atan2(bdx, -bdy);
  for (const [c, k, p] of plan) {
    let v = 0;
    if (k === 'near') v = f[p]; else if (k === 'far') v = f[16 + p];
    else if (k === 'rear') v = Math.max(f[p], f[16 + p] * 0.7);
    else if (k === 'bossAz') { let da = Math.abs(ang - p); da = Math.min(da, 2 * Math.PI - da); v = gauss(da, 0.35) * Math.max(0.2, 1 - bd / 600); }
    else if (k === 'bdx') v = gauss(bdx - p, 30); else if (k === 'bdy') v = gauss(bdy - p, 35);
    else if (k === 'fx') v = Math.max(0, p * f[35] / 3); else if (k === 'fy') v = Math.max(0, p * f[36] / 3);
    else if (k === 'px') v = gauss(f[37] - p, 0.08); else if (k === 'py') v = gauss(f[38] - p, 0.08);
    drive[c] = 2 * Math.min(1, v);
  }
}
