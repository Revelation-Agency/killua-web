/** Regression checks for small browser viewports, reachable navigation and motion controls.
 * Uses the same externally installed Playwright as verify-lead-flow.mjs.
 * KILLUA_QA_URL may target the published site; no lead submissions are made.
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
let pw;
try { pw = await import('playwright'); }
catch { pw = createRequire(`${process.env.APPDATA}/npm/node_modules/`)('playwright'); }
const base = process.env.KILLUA_QA_URL || 'http://127.0.0.1:4330';
const out = process.env.KILLUA_QA_OUTPUT;
if (out) await mkdir(out, { recursive:true });
const engine = process.env.KILLUA_QA_ENGINE === 'webkit' ? pw.webkit : pw.chromium;
const browser = await engine.launch(engine === pw.chromium ? {channel:'chrome'} : {});
const errors = [];
const evidence = [];
try {
  // First-time visitors still have the consent banner open. It must not cover
  // or trap the menu, and closing the menu must leave consent usable.
  const freshContext = await browser.newContext({ viewport:{width:390,height:620},hasTouch:true });
  const fresh = await freshContext.newPage();
  fresh.on('pageerror',error=>errors.push(error.message));
  await fresh.goto(base,{waitUntil:'networkidle'});
  await fresh.locator('#cookie').waitFor({state:'visible'});
  await fresh.getByRole('button',{name:'Open menu',exact:true}).click();
  assert.equal(await fresh.locator('#cookie').isVisible(),false,'Consent banner covers menu');
  await fresh.setViewportSize({width:390,height:540});
  await fresh.waitForTimeout(450);
  await fresh.mouse.move(190,300);
  await fresh.mouse.wheel(0,400);
  await fresh.waitForTimeout(300);
  assert.ok(await fresh.locator('.drawer-content').evaluate(el=>el.scrollTop>0),'Menu does not scroll from user input');
  await fresh.getByRole('navigation',{name:'Mobile',exact:true}).getByRole('link',{name:'Contact',exact:true}).scrollIntoViewIfNeeded();
  await fresh.keyboard.press('Escape');
  assert.equal(await fresh.locator('#cookie').isVisible(),true);
  await fresh.getByRole('button',{name:'Reject all',exact:true}).click();
  assert.equal(await fresh.locator('#cookie').isVisible(),false);
  await fresh.getByRole('button',{name:'Open menu',exact:true}).click();
  await fresh.locator('.drawer-cta').getByRole('link',{name:'Get a quote',exact:true}).click();
  assert.equal(await fresh.locator('[data-drawer]').getAttribute('aria-hidden'),'true');
  assert.equal(await fresh.locator('main').evaluate(el=>el.inert),false);
  assert.equal(new URL(fresh.url()).hash,'#quote');
  await freshContext.close();
  console.log('PASS first-visit consent banner, viewport resizing, and menu quote navigation');
  for (const [width,height] of [[320,568],[390,620],[390,844],[844,390],[768,600],[1440,900]]) {
    const context = await browser.newContext({ viewport:{width,height},hasTouch:width<1024 });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(()=>localStorage.setItem('killua_consent_v1',JSON.stringify({v:1,analytics:false,ads:false,ts:'test'})));
    await page.goto(base, {waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForFunction(()=>window.__motionReady === true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`Overflow at ${width}x${height}`);
    if (width<1024) {
      // Simulate opening from a scrolled page, like an in-app mobile browser.
      await page.evaluate(()=>window.scrollTo(0,350));
      const before = await page.evaluate(()=>scrollY);
      await page.getByRole('button',{name:'Open menu',exact:true}).click();
      await page.waitForTimeout(450);
      assert.equal(await page.locator('main').evaluate(el=>el.inert),true);
      assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).position),'fixed');
      const links = page.getByRole('navigation',{name:'Mobile',exact:true}).getByRole('link');
      const count = await links.count();
      assert.equal(count,9);
      for(let i=0;i<count;i++) {
        const link=links.nth(i);
        await link.scrollIntoViewIfNeeded();
        const reachable=await link.evaluate(el=>{
          const r=el.getBoundingClientRect();
          const x=r.left+r.width/2, y=r.top+r.height/2;
          return y>0 && y<innerHeight && el.contains(document.elementFromPoint(x,y));
        });
        assert.ok(reachable,`Menu link ${await link.innerText()} covered at ${width}x${height}`);
      }
      const quote=page.locator('.drawer-cta').getByRole('link',{name:'Get a quote',exact:true});
      await quote.scrollIntoViewIfNeeded();
      assert.ok(await quote.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}));
      // The final link and action button must occupy separate layout space.
      const lastBox=await links.last().boundingBox(), quoteBox=await quote.boundingBox();
      assert.ok(lastBox.y+lastBox.height<=quoteBox.y, 'Menu action overlaps final link');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('main').evaluate(el=>el.inert),false);
      assert.ok(Math.abs((await page.evaluate(()=>scrollY))-before)<3,'Scroll position changed on close');
      assert.equal(await page.getByRole('button',{name:'Open menu',exact:true}).evaluate(el=>el===document.activeElement),true);
      if(out && width===390 && height===620){
        await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.waitForTimeout(450);
        await page.locator('.drawer-content').evaluate(el=>el.scrollTop=0);
        await page.screenshot({path:`${out}/menu-short-phone-top.png`});
        await quote.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/menu-short-phone-bottom.png`});
        await page.keyboard.press('Escape');
      }
    }
    const scene=page.locator('[data-system]');
    await scene.scrollIntoViewIfNeeded();await page.waitForTimeout(700);
    for(const label of ['Store','Protect','Charge','Capture']){
      await page.getByRole('button',{name:new RegExp(label)}).click();
      assert.equal(await page.locator('[data-system-panel]:visible').count(),1);
    }
    await page.waitForTimeout(450);
    assert.equal(await page.locator('.solar-path').evaluate(el=>getComputedStyle(el).animationPlayState),'running');
    const flowBefore = await page.locator('.solar-path').evaluate(el=>getComputedStyle(el).strokeDashoffset);
    await page.waitForTimeout(150);
    assert.notEqual(await page.locator('.solar-path').evaluate(el=>getComputedStyle(el).strokeDashoffset),flowBefore,'Energy path is not moving');
    if(out && width===1440)await page.screenshot({path:`${out}/energy-system-desktop.png`});
    if(out && width===390 && height===844)await page.screenshot({path:`${out}/energy-system-phone.png`});
    await page.getByRole('button',{name:'Pause animations',exact:true}).click();
    assert.equal(await page.locator('.solar-path').evaluate(el=>getComputedStyle(el).animationPlayState),'paused');
    assert.equal(await page.locator('html').getAttribute('data-motion'),'paused');
    await page.getByRole('button',{name:'Play animations',exact:true}).click();
    assert.equal(await page.locator('html').getAttribute('data-motion'),'active');
    // Reset after the header scrolls into view and prove offscreen effects sleep.
    await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(400);
    assert.equal(await page.locator('.solar-path').evaluate(el=>getComputedStyle(el).animationPlayState),'paused');
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
    assert.equal(await page.locator('html').getAttribute('data-motion'),'paused');
    assert.equal(await page.locator('.sun-ring').evaluate(el=>getComputedStyle(el).animationName),'none');
    assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).opacity),'1');
    evidence.push({width,height,menuLinksReachable:width<1024?9:'desktop',motionControls:true,reducedMotion:true});
    console.log(`PASS ${width}x${height}: navigation, energy controls, motion pause and reduced motion`);
    await context.close();
  }
  assert.deepEqual(errors,[]);
  if(out)await writeFile(`${out}/motion-verification.json`,JSON.stringify({url:base,engine:process.env.KILLUA_QA_ENGINE||'chromium',date:new Date().toISOString(),evidence,errors},null,2));
  console.log('All motion and menu checks passed. No browser errors.');
} finally { await browser.close(); }
