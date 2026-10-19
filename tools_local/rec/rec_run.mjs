import puppeteer from 'puppeteer-core'; import fs from 'fs';
const [url,outDir,hold]=[process.argv[2],process.argv[3],+(process.argv[4]||120)];
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage(); p.on('console',m=>console.log('[page]',m.text())); p.on('pageerror',e=>console.log('[err]',e.message));
await p.setViewport({width:460,height:616});
await p.goto(url,{waitUntil:'networkidle0'}); await p.waitForFunction('window.__readyFlag===true',{timeout:20000});
console.log('ready',JSON.stringify(await p.evaluate(()=>window.__ready())));
fs.mkdirSync(outDir,{recursive:true}); let i=0,r,extra=0;
while(true){r=await p.evaluate(()=>window.__step());fs.writeFileSync(`${outDir}/f${String(i++).padStart(5,'0')}.jpg`,Buffer.from(r.img.split(',')[1],'base64'));
 if(r.done){if(++extra>hold)break;}}
console.log('stats',JSON.stringify({frames:r.f,score:r.score,hp:r.hp,graze:r.graze,kf:r.kf,written:i}));
await b.close();
