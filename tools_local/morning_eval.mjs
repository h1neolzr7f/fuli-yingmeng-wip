// SEED0=90001 HARD_MULT=1.4 CARDS=5 LIVES=3 node tools_local/morning_eval.mjs N name:ckpt|idle[:F] ...
// Extended metrics: kills, mean TTK (kills only), mean score, mean boss dmg, mean graze, survival rate (alive at 1800f), mean survival time
import fs from 'fs';
import { MaleCNSConnectome } from '../src/brain/connectome.js';
import { ReadoutPolicy } from '../src/brain/policy.js';
import { DanmakuGame } from '../src/game/danmaku.js';
const HM=Number(process.env.HARD_MULT||1.4), NC=Number(process.env.CARDS||5), LV=Number(process.env.LIVES||3), S0=Number(process.env.SEED0||90001);
const [N,...specs]=process.argv.slice(2); const seeds=Array.from({length:+N},(_,i)=>S0+i);
const g=JSON.parse(fs.readFileSync('public/data/connectome/graph.json','utf8'));
const out={};
for(const sp of specs){const [nm,ck,fm]=sp.split(':');const fz=fm!=='NF';
 const idle=ck==='idle'; const pol=idle?null:new ReadoutPolicy(Float64Array.from(JSON.parse(fs.readFileSync(ck,'utf8')).weights));
 const brain=new MaleCNSConnectome(g); const per=[];
 for(const s of seeds){brain.reset();const game=new DanmakuGame(null,{width:460,height:580,seed:s,fixedMult:HM,bossVision:fz,freeMove:fz});
  game.setSpellcard(s%NC);Object.assign(game.player,{lives:LV,maxLives:LV,autoRespawn:false,invulnerableTimer:0});
  let f=0,kf=0;while(!game.player.isDead&&f<1800){let m={moveX:0,moveY:0};if(!idle)m=pol.forward(brain.step(game.getBiologicalSensoryInput(),false));
   game.update(m);f++;if(game.boss.hp<=0&&!kf)kf=f;}
  per.push({seed:s,card:s%NC,frames:f,alive:!game.player.isDead,dmg:game.boss.maxHp-game.boss.hp,kill:game.boss.hp<=0,ttk:kf?kf/60:null,score:game.player.score,graze:game.player.graze,livesLeft:game.player.lives});}
 const n=per.length,m=k=>per.reduce((a,p)=>a+p[k],0)/n,K=per.filter(p=>p.kill);
 const r={name:nm,ckpt:ck,bossVision:fz,n,kills:K.length,meanTTK:K.length?K.reduce((a,p)=>a+p.ttk,0)/K.length:null,meanScore:m('score'),meanDmg:m('dmg'),meanGraze:m('graze'),survivalRate:per.filter(p=>p.alive).length/n,meanSurvSec:m('frames')/60,
  best:per.slice().sort((a,b)=>b.score-a.score).slice(0,5)};
 out[nm]={...r,per};
 console.log(JSON.stringify({...r,best:r.best.map(p=>`${p.seed}#${p.score}/dmg${p.dmg.toFixed(0)}/${(p.frames/60).toFixed(1)}s`)}));}
if(process.env.OUT)fs.writeFileSync(process.env.OUT,JSON.stringify({HM,NC,LV,S0,N:+N,out},null,1));
