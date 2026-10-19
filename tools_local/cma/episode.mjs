// Shared episode runner. Knobs: mult, bossHp, lives, repeat, cards; fitness = dmg*DW + frames + kill bonus(+speed)
import fs from 'fs';
import { MaleCNSConnectome } from '../../src/brain/connectome.js';
import { ReadoutPolicy } from '../../src/brain/policy.js';
import { DanmakuGame } from '../../src/game/danmaku.js';
export const GRAPH = JSON.parse(fs.readFileSync(new URL('../../public/data/connectome/graph.json', import.meta.url), 'utf8'));
function rng(s){return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
export function makeGame(seed, o) {
  const dr = o.dr || process.env.DR === '1'; const R = rng(seed * 7919 + 13);
  const mult = dr ? o.mult * (0.9 + 0.2 * R()) : o.mult;
  const g = new DanmakuGame(null, { width: 460, height: 580, seed, fixedMult: mult, bossVision: true, freeMove: true, strict: !!(o.strict || process.env.STRICT === '1') });
  const card = dr ? Math.floor(R() * (o.cards || 5)) : seed % (o.cards || 5);
  g.setSpellcard(card);
  if (dr) {
    g.bossSpd = 0.75 + 0.5 * R(); g.bossPhase = R() * 2 * Math.PI; const sp = 0.85 + 0.3 * R();
    g._sp = sp; const proto = Object.getPrototypeOf(g).update;
    g.update = function (m) { const r = proto.call(this, m); for (const b of this.bullets) if (!b._dr) { b._dr = 1; b.vx *= this._sp; b.vy *= this._sp; } return r; };
  }
  Object.assign(g.player, { lives: o.lives, maxLives: o.lives, autoRespawn: false, invulnerableTimer: 0 });
  const tier = +(o.tier ?? process.env.TIER ?? 0);
  if (tier > 0) {
    // Harder tiers: extra randomized pattern mix (spiral, aimed stream, rings, side crossfire, random rain) + faster bullets.
    // State lives on g so planner clones stay consistent; per-episode mix from seed.
    let st = (seed * 2654435761 + 97) >>> 0; const rnd = () => (st = (st * 1664525 + 1013904223) >>> 0) / 4294967296;
    const pats = ['spiral', 'aimed', 'ring', 'cross', 'rain'];
    const nP = Math.min(5, 1 + Math.floor(tier / 1.5) + Math.floor(rnd() * 2));
    const chosen = []; while (chosen.length < nP) { const q = pats[Math.floor(rnd() * 5)]; if (!chosen.includes(q)) chosen.push(q); }
    g._ex = { tier, chosen, sp: 1 + 0.12 * tier, s: (seed * 7 + 3) >>> 0, phase: rnd() * 6.28, t: 0 };
    const protoU = g.update;
    g.update = function (m) {
      const r = protoU.call(this, m); const E = this._ex; E.t++; const T = E.t;
      const R = () => (E.s = (E.s * 1664525 + 1013904223) >>> 0) / 4294967296;
      const push = (x, y, vx, vy, col) => this.bullets.push({ x, y, vx: vx * E.sp, vy: vy * E.sp, radius: 3.5, color: col, grazed: false, _dr: 1 });
      const bx = this.boss.x, by = this.boss.y, px = this.player.x, py = this.player.y, k = E.tier;
      if (this.player.isDead) return r;
      for (const q of E.chosen) {
        if (q === 'spiral' && T % Math.max(2, 6 - k) === 0) { for (let a = 0; a < 2; a++) { const ang = E.phase + T * 0.13 + a * Math.PI; push(bx, by, Math.cos(ang) * 2.2, Math.sin(ang) * 2.2, '#f472b6'); } }
        if (q === 'aimed' && T % Math.max(8, 30 - 4 * k) < 3 && T % 2 === 0) { const ang = Math.atan2(py - by, px - bx) + (R() - 0.5) * 0.15; push(bx, by, Math.cos(ang) * 3.2, Math.sin(ang) * 3.2, '#facc15'); }
        if (q === 'ring' && T % Math.max(30, 90 - 12 * k) === 0) { const n = 12 + 4 * k, o = R() * 6.28; for (let i = 0; i < n; i++) { const ang = o + i * 6.28 / n; push(bx, by, Math.cos(ang) * 1.8, Math.sin(ang) * 1.8, '#60a5fa'); } }
        if (q === 'cross' && T % Math.max(10, 40 - 5 * k) === 0) { const y0 = 150 + R() * (this.height - 250); const left = R() < 0.5; push(left ? -10 : this.width + 10, y0, (left ? 1 : -1) * 2.6, (R() - 0.5) * 0.6, '#34d399'); }
        if (q === 'rain' && T % Math.max(3, 9 - k) === 0) { push(R() * this.width, -10, (R() - 0.5) * 0.8, 1.6 + R() * 1.2, '#e5e7eb'); }
      }
      return r;
    };
  }
  if (o.bossHp) { g.boss.maxHp = o.bossHp; g.boss.hp = o.bossHp; }
  return g;
}
export function episode(brain, policy, seed, o, teacher = null, record = null) {
  if (brain) brain.reset();
  const g = makeGame(seed, o);
  let f = 0, kf = 0, m = { moveX: 0, moveY: 0 }, sdx = 0, ierr = 0, al = 0, band = 0, close = 0;
  const rep = o.repeat || 1;
  while (!g.player.isDead && f < 1800) {
    if (f % rep === 0) {
      const obs = g.getBiologicalSensoryInput();
      const dn = brain ? brain.step(obs, false) : null;
      if (teacher) { m = teacher(g); if (record && dn) record.push([Array.from(dn), m.moveX, m.moveY]); }
      else if (policy) { m = policy.forward(dn); if (o.imit) { const t = teacherX(g); ierr += (m.moveX - t.moveX) ** 2; } }
      else m = { moveX: 0, moveY: 0 };
    }
    const adx = Math.abs(g.boss.x - g.player.x); sdx += adx; if (adx < 20) al++;
    const ddy = g.player.y - g.boss.y; if (adx < 35 && ddy >= 120 && ddy <= 260) band++; if (Math.hypot(adx, ddy) < (o.DMIN ?? 100)) close++;
    g.update(m); f++;
    if (!kf && g.boss.hp <= 0) kf = f;
  }
  const dmg = g.boss.maxHp - g.boss.hp;
  return { frames: f, dx: sdx / f, aligned: al, imse: ierr / Math.max(1, Math.ceil(f / rep)), dmg, dmgFrac: dmg / g.boss.maxHp, kill: kf > 0, kf, score: g.player.score, graze: g.player.graze, band, close, hits: g.player.totalHits };
}
export function fitnessOf(r, o) {
  if (o.imit) return 1000 * (1 - r.imse) + 0.2 * r.frames;
  if (o.survive) return r.frames - (o.EZ ? (r.edge ?? 0) : 0) - (o.EW ?? 0) * (r.edge ?? 0) - (o.HW ?? 300) * r.hits + (o.GW ?? 2) * Math.min(r.graze, o.GCAP ?? 200) + (r.hits === 0 ? (o.NHB ?? 0) : 0) - (o.DGW ?? 0) * (r.danger ?? 0);
  if (o.band) return -(o.DXW ?? 0) * (r.dxpen ?? 0) - (o.FW ?? 0) * (r.far ?? 0) + (o.BW ?? 2) * r.band - (o.CW ?? 4) * r.close + (o.GW ?? 3) * Math.min(r.graze, o.GCAP ?? 150) - (o.HW ?? 150) * r.hits + r.frames + (o.DW ?? 6000) * r.dmgFrac + (r.kill ? (o.KB ?? 30000) + 4 * (1800 - r.kf) : 0);
  return (o.AW ?? 0) * r.aligned + r.frames + (o.DW ?? 3000) * r.dmgFrac + (r.kill ? (o.KB ?? 20000) + 4 * (1800 - r.kf) : 0);
}
export const teacherX = (g) => ({ moveX: Math.max(-1, Math.min(1, (g.boss.x - g.player.x) / 8)), moveY: 0 });
