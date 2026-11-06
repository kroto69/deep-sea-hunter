import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const [name,viewport] of [['desktop',{width:1280,height:720}],['mobile landscape',{width:844,height:390}]]){
  const context=await browser.newContext({viewport,hasTouch:name!=='desktop',isMobile:name!=='desktop'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:8080');await page.waitForFunction(()=>window.__dsh?.hub);await page.locator('#welcome').waitFor({state:'visible'});
  assert.equal(await page.locator('#welcome-google').isVisible(),false);
  await page.locator('#welcome-guest').click();await page.locator('#tutorial').waitFor({state:'visible'});
  for(let i=1;i<=5;i++){assert.equal((await page.locator('#tutorial-step-count').textContent()).trim(),`0${i} / 05`);if(i<5)await page.locator('#tutorial-next').click();}
  await page.locator('#tutorial-finish').click();await page.locator('#hub').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('dsh.save.v2')).tutorialComplete),true);
  await page.locator('#hub-close').click();await page.keyboard.press('Escape');await page.locator('#pause-tutorial').click();await page.locator('#tutorial').waitFor({state:'visible'});await page.locator('#tutorial-skip').click();await page.locator('#tutorial').waitFor({state:'hidden'});
  const boxes=await page.evaluate(()=>['#welcome','#tutorial','#hub-panel','#hud-top-left','#hud-top-right'].map(q=>{const e=document.querySelector(q),r=e.getBoundingClientRect();return [q,r.left,r.top,r.right,r.bottom,getComputedStyle(e).display]}));
  const viewportSize=await page.evaluate(()=>[innerWidth,innerHeight]);for(const [selector,l,t,r,b,d] of boxes)if(d!=='none'&&selector!=='#welcome'&&selector!=='#tutorial'){assert.ok(l>=0&&t>=0&&r<=viewportSize[0]&&b<=viewportSize[1],`${selector} overflow: ${[l,t,r,b]}`);}
  assert.deepEqual(errors,[]);console.log('PASS',name,'welcome/guest/tutorial/skip/replay/save/layout');await context.close();
 }
}finally{await browser.close();}
