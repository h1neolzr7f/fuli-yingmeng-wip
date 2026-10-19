import fs from 'fs';
import { MaleCNSConnectome } from '../../src/brain/connectome.js';
import { ReadoutPolicy } from '../../src/brain/policy.js';
import { GRAPH, episode } from './episode.mjs';
import { applyGains } from './gains.mjs';
const specs=process.argv.slice(2); const seeds=Array.from({length:200},(_,i)=>90001+i);
console.log('name | repeat | survival frames | boss dmg | dmg/sec | kills/200 | time-to-kill | grazes | score');
for(const sp of specs){const [nm,ck,rep]=sp.split(':');const o={mult:1.4,lives:3,repeat:+rep||1,cards:5};
 const brain=new MaleCNSConnectome(GRAPH);const base=Float64Array.from(brain.eWeight);let pol=null;
 if(ck!=='idle'){const w=JSON.parse(fs.readFileSync(ck,'utf8')).weights;applyGains(brain,base,w.slice(320).length>2?w.slice(320):[]);pol=new ReadoutPolicy(Float64Array.from(w.slice(0,320)));}
 let F=0,D=0,K=0,KT=0,G=0,S=0;const ks=[];
 for(const s of seeds){const r=episode(ck==='idle'?null:brain,pol,s,o);F+=r.frames;D+=r.dmg;G+=r.graze;S+=r.score;if(r.kill){K++;KT+=r.kf;ks.push(s+'@'+(r.kf/60).toFixed(1)+'s#'+r.score);}}
 console.log(`${nm} | ${o.repeat} | ${(F/200).toFixed(1)} | ${(D/200).toFixed(1)} | ${(D/(F/60)).toFixed(1)} | ${K}/200 | ${K?(KT/K/60).toFixed(1)+'s':'-'} | ${(G/200).toFixed(1)} | ${Math.round(S/200)}`);
 if(ks.length)console.log('  killSeeds',ks.slice(0,15).join(' '));}
