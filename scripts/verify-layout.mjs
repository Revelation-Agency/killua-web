import { chromium, webkit } from 'playwright';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.KILLUA_QA_URL||'http://127.0.0.1:4330';
const out=process.env.KILLUA_QA_OUTPUT;
const routes=[];
async function walk(dir,route='/'){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(entry.isDirectory())await walk(join(dir,entry.name),route+entry.name+'/');
    else if(entry.name==='index.html')routes.push(route);
  }
}
await walk('dist');
const engine=process.env.KILLUA_QA_ENGINE==='webkit'?webkit:chromium;
const browser=await engine.launch(engine===chromium?{channel:'chrome'}:{});
const failures=[], evidence=[], errors=[], externalErrors=[];
if(out)await mkdir(out,{recursive:true});
try{
  const context=await browser.newContext({reducedMotion:'reduce'});
  await context.addInitScript(()=>localStorage.setItem('killua_consent_v1',JSON.stringify({v:1,analytics:false,ads:false,ts:'test'})));
  const page=await context.newPage();
  page.on('pageerror',e=>{
    const issue={url:page.url(),message:e.message};
    if(e.message.includes('services.leadconnectorhq.com/'))externalErrors.push(issue);
    else errors.push(issue);
  });
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    for(const route of routes){
      const response=await page.goto(base+route,{waitUntil:'load'});
      await page.evaluate(()=>document.fonts.ready);
      // Let deferred site modules finish before navigating to the next route.
      if(await page.locator('script:not([src])').evaluateAll(nodes=>nodes.some(el=>el.textContent.includes('__motionReady'))))await page.waitForFunction(()=>window.__motionReady===true);
      const result=await page.evaluate(()=>{
        const root=document.documentElement;
        const overflow=[...document.querySelectorAll('main h1,main h2,main h3,main p,main .btn,main input:not([type=hidden]),main select,main .callout')].filter(el=>{
          if(!el.getClientRects().length||el.closest('[hidden],.hp'))return false;
          const r=el.getBoundingClientRect();
          return r.left< -1||r.right>innerWidth+1||el.scrollWidth>el.clientWidth+3;
        }).map(el=>({tag:el.tagName,text:el.textContent.trim().slice(0,70),class:el.className}));
        const badImages=[...document.querySelectorAll('img')].filter(el=>el.complete&&!el.naturalWidth).map(el=>el.alt);
        const hero=document.querySelector('.page-hero .shell');
        let heroOverlap=false;
        if(hero?.children.length===2){const[a,b]=[...hero.children].map(el=>el.getBoundingClientRect());heroOverlap=a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}
        return {overflow,documentOverflow:root.scrollWidth>innerWidth+1,badImages,heroOverlap,pauseButtons:document.querySelectorAll('[data-motion-control]').length};
      });
      const item={route,width,status:response.status(),...result};evidence.push(item);
      if(item.status!==200||item.documentOverflow||item.overflow.length||item.badImages.length||item.heroOverlap||item.pauseButtons)failures.push(item);
      if(out&&['/','/ev-chargers/','/contact/'].includes(route)&&[390,1440].includes(width))await page.screenshot({path:`${out}/${route==='/'?'home':route.replaceAll('/','')}-${width}.png`,fullPage:true});
    }
    console.log(`Checked ${routes.length} pages at ${width}px`);
  }
  if(out)await writeFile(`${out}/layout-verification.json`,JSON.stringify({date:new Date().toISOString(),base,engine:process.env.KILLUA_QA_ENGINE||'chromium',evidence,errors,externalErrors,failures},null,2));
  console.log(JSON.stringify({pages:routes.length,viewports:4,checks:evidence.length,failures,errors,externalErrors},null,2));
  assert.deepEqual(failures,[]);assert.deepEqual(errors,[]);
}finally{await browser.close();}
