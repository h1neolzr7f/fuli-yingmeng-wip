// HARD_MULT=1.4 CARDS=5 LIVES=3 [KS=1] [RAND=0] node tools_local/hard_eval.mjs N name:ckpt[:F] ...
import fs from 'fs';
import { MaleCNSConnectome } from '../src/brain/connectome.js';
import { ReadoutPolicy } from '../src/brain/policy.js';
import { DanmakuGame } from '../src/game/danmaku.js';
const HM=Number(process.env.HARD_MULT||0), NC=Number(process.env.CARDS||3), LV=Number(process.env.LIVES||1);
const [N,...specs]=process.argv.slice(2); const seeds=Array.from({length:+N},(_,i)=>90001+i);
const g=JSON.parse(fs.readFileSync('public/data/connectome/graph.json','utf8'));
function run(w,mode,fz){const brain=new MaleCNSConnectome(g);const pol=w?new ReadoutPolicy(Float64Array.from(w)):null;
 let F=0,D=0,K=0,KT=0,G=0,SC=0;const ks=[];
 for(const s of seeds){brain.reset();const game=new DanmakuGame(null,{width:460,height:580,seed:s,fixedMult:HM,bossVision:fz,freeMove:fz});
  game.setSpellcard(s%NC);Object.assign(game.player,{lives:LV,maxLives:LV,autoRespawn:false,invulnerableTimer:0});
  let f=0,kf=0;while(!game.player.isDead&&f<1800){let m={moveX:0,moveY:0};
   if(mode!=='idle'){m=pol.forward(brain.step(game.getBiologicalSensoryInput(),mode==='silenced'));}
   game.update(m);f++;if(game.boss.hp<=0&&!kf)kf=f;}
  F+=f;D+=game.boss.maxHp-game.boss.hp;G+=game.player.graze;SC+=game.player.score;
  if(game.boss.hp<=0){K++;KT+=kf;ks.push(`${s}@${(kf/60).toFixed(1)}s#${game.player.score}`);}}
 const n=seeds.length;return {F:F/n,D:D/n,K,TTK:K?KT/K/60:0,G:G/n,SC:SC/n,ks};}
const fmt=(nm,r)=>`${nm} | ${r.F.toFixed(1)} | ${r.D.toFixed(1)} | ${(r.D/(r.F/60)).toFixed(1)} | ${r.K}/${seeds.length} | ${r.K?r.TTK.toFixed(1)+'s':'-'} | ${r.G.toFixed(1)} | ${Math.round(r.SC)}`;
console.log(`HARD_MULT=${HM} CARDS=${NC} LIVES=${LV} seeds=${N}\nname | survival frames | boss dmg | dmg/sec | kills | time-to-kill | grazes | score`);
for(const sp of specs){const [nm,ck,fm]=sp.split(':');const fz=fm==='F';const w=JSON.parse(fs.readFileSync(ck,'utf8')).weights;
 const r=run(w,'normal',fz);console.log(fmt(nm,r));if(process.env.KS)console.log('killSeeds '+nm+' '+r.ks.join(' '));
 if(process.env.SIL)console.log(fmt(nm+' silenced',run(w,'silenced',fz)));}
if(process.env.RAND!=='0'){let rs=12345;const rnd=()=>{rs=(rs*1103515245+12345)%2147483648;return rs/2147483648};
 const a={F:0,D:0,K:0,TTK:0,G:0,SC:0};for(let k=0;k<10;k++){const r=run(Array.from({length:320},()=>(rnd()-0.5)*1.5),'normal',true);for(const q of ['F','D','G','SC'])a[q]+=r[q]/10;a.K+=r.K/10;}console.log(fmt('random(10 avg)',a));}
console.log(fmt('standing still',run(null,'idle',true)));
