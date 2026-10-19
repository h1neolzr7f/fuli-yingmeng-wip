import fs from 'fs';
import { MaleCNSConnectome } from '../src/brain/connectome.js';
import { ReadoutPolicy } from '../src/brain/policy.js';
import { DanmakuGame } from '../src/game/danmaku.js';
const [ck,N,start,out]=[process.argv[2],+process.argv[3],+process.argv[4],process.argv[5]];
const w=Float64Array.from(JSON.parse(fs.readFileSync(ck,'utf8')).weights);
const brain=new MaleCNSConnectome(JSON.parse(fs.readFileSync('public/data/connectome/graph.json','utf8'))); const pol=new ReadoutPolicy(w);
const kills=[];
for(let s=start;s<start+N;s++){brain.reset();
  const game=new DanmakuGame(null,{width:460,height:580,seed:s,fixedMult:1.4,bossVision:true,freeMove:true});
  game.setSpellcard(s%5);Object.assign(game.player,{lives:3,maxLives:3,autoRespawn:false,invulnerableTimer:0});
  let f=0,kf=0;while(!game.player.isDead&&f<1800){game.update(pol.forward(brain.step(game.getBiologicalSensoryInput(),false)));f++;if(game.boss.hp<=0&&!kf)kf=f;}
  if(game.boss.hp<=0)kills.push({seed:s,card:s%5,ttk:+(kf/60).toFixed(1),score:game.player.score,graze:game.player.graze,livesLeft:game.player.lives});}
fs.writeFileSync(out,JSON.stringify({ck,N,start,kills:kills.length,list:kills.sort((a,b)=>b.score-a.score)},null,1));
