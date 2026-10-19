// soft danger labels + raw bullet features. env PLAN_MODE=survive TIER MULT. node gen_soft.mjs ckpt s0 n out beta
import fs from 'fs'; import * as F3 from './fly.mjs'; import { features } from './eye2.mjs';
import { makeGame } from '../cma/episode.mjs'; import { ACTS, rollout } from '../expert/planner.mjs';
const [ck, s0, n, out, beta] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5], +process.argv[6]];
const B = F3.makeBrain(); const pol = F3.setParams(B, JSON.parse(fs.readFileSync(ck,'utf8')).weights); const NB = 24;
export function raw(g) { const p = g.player, W = g.width, H = g.height; const bs = g.bullets.map(b => [b.x-p.x, b.y-p.y, b.vx||0, b.vy||0]).map(q=>[...q, Math.hypot(q[0],q[1])]).sort((a,b)=>a[4]-b[4]).slice(0,NB);
  const v = [p.x/W-0.5, p.y/H-0.5, (g.boss.x-p.x)/W, (g.boss.y-p.y)/H];
  for (let i=0;i<NB;i++){ const q=bs[i]; if(!q){v.push(0,0,0,0,0,0);continue;} const rv=-(q[0]*q[2]+q[1]*q[3])/(q[4]+1e-6); v.push(q[0]/100,q[1]/100,q[2]/4,q[3]/4,Math.min(1,Math.max(0,rv)*20/(q[4]+1)), 50/(q[4]+10)); }
  return v.map(x=>+x.toFixed(3)); }
const E = [];
for (let s=s0;s<s0+n;s++){ B.brain.reset(); const g = makeGame(s,{mult:+(process.env.MULT||1.6),tier:+(process.env.TIER||2),lives:3,cards:5,strict:true,dr:true}); const ep=[]; let f=0,m={moveX:0,moveY:0},ch=0;
  while(!g.player.isDead && f<1800){ if(f%4===0){ const ft=features(g); const sm=pol.forward(F3.dnFromFeat(B,ft));
      const vals=ACTS.map(a=>Math.max(rollout(g,a,0),rollout(g,a,1),rollout(g,a,2))); const bi=vals.indexOf(Math.max(...vals));
      const sp=[]; for(let i=0;i<ft.length;i++) if(ft[i]) sp.push(i,+ft[i].toFixed(3));
      ep.push({r:raw(g), sp, v:vals.map(x=>Math.round(x))});
      if(ch>0){m=ACTS[bi];ch--;} else if(Math.random()<beta){m=ACTS[bi];ch=2;} else m=sm; }
    g.update(m); f++; }
  E.push(ep); }
fs.writeFileSync(out, JSON.stringify(E)); console.log('done', E.map(e=>e.length).join(','));
