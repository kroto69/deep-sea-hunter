import assert from 'node:assert/strict';
import {testDatabase} from '../server/test/database.js';
import {buildApp} from '../server/src/app.js';
import {tick} from '../server/src/services/ticks.js';
if(!process.env.PLAYWRIGHT_MODULE)throw new Error('Set PLAYWRIGHT_MODULE to installed Playwright module path');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const f=await testDatabase(),app=buildApp(f.db);let browser;
try{
 await f.db.query("UPDATE merchant_accounts SET tick_started_at=clock_timestamp()-interval '2 minutes'");await tick(f.db);
 const base=await app.listen({host:'127.0.0.1',port:0});
 browser=await chromium.launch({...(process.env.CHROMIUM_PATH&&{executablePath:process.env.CHROMIUM_PATH}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const origin=process.env.GAME_URL||'http://localhost:8080';
 for(const touch of [false,true]){
  const context=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1280,height:720},hasTouch:touch,isMobile:touch});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.waitForFunction(()=>window.__dsh,{timeout:30000});
  const result=await page.evaluate(async base=>{
   const {online,hub,progression,camera,fishSystem}=window.__dsh;
   hub.tab='online';hub.show();
   progression.addCash(17);const saved=localStorage.getItem('dsh.save.v2'),before=JSON.stringify(progression.data);
   online.base=base;await online.connect();camera.position.set(48,26,-42);
   if(!online.active||online.walletId!==null)throw new Error('Online Guest must stay playable without wallet');
   if(!fishSystem.canCatch({id:'clownfish'}))throw new Error('Common fish blocked');
   if(fishSystem.canCatch({id:'grouper'}))throw new Error('Rare fish not gated');
   const initial=online.populations.find(p=>p.species_id==='clownfish').population_count;
   const fish=fishSystem.fish.find(f=>f.alive&&f.spec.id==='clownfish');if(!fish)throw new Error('No common fish');
   fishSystem.collect(fish);while(online.flushing)await new Promise(r=>setTimeout(r,20));
   if(online.error)throw new Error(online.error);
   const receipt=online.inventory.receipts.find(r=>r.status==='valid');if(!receipt)throw new Error('Receipt absent');
   const order=online.orders.find(o=>o.species_id==='clownfish');
   for(const tab of ['online','market','equipment','missions','zones','records','workshop','storage','collectibles']){
    hub.root.querySelector(`[data-tab="${tab}"]`).click();
    if(hub.tab!==tab||!hub.body.textContent.trim())throw new Error(`Online tab ${tab} is empty`);
   }
   hub.tab='online';hub.render();
   if(!hub.body.textContent.includes('MERCHANT TREASURY')||!hub.body.textContent.includes('FISH NEEDED'))throw new Error('Overview metrics missing');
   hub.tab='market';hub.render();
   if(!order||order.status!=='open'||!hub.body.textContent.includes('Dock Merchant')||!hub.body.textContent.includes('Current orders / fish requirements')||!hub.body.textContent.includes('Your inventory'))throw new Error('Merchant order not displayed');
   if(hub.body.scrollWidth>hub.body.clientWidth+2||hub.root.scrollWidth>innerWidth+2)throw new Error('Merchant panel overflows horizontally');
   if(!hub.root.querySelector('#hub-wallet')||hub.root.querySelector('#hub-tabs').getBoundingClientRect().bottom>innerHeight)throw new Error('Navigation or wallet control outside viewport');
   const treasury=BigInt(online.market.merchant[0].total_treasury),quantity=order.quantity;
   await online.action('sell',receipt.id);if(online.error)throw new Error(online.error);
   const balance=Number(online.profile.balance),population=online.populations.find(p=>p.species_id==='clownfish').population_count;
   if(treasury-BigInt(online.market.merchant[0].total_treasury)!==BigInt(balance)||online.orders.find(o=>o.species_id==='clownfish').quantity!==quantity-1)throw new Error('Merchant order / treasury not settled');
   if(online.inventory.receipts.find(r=>r.id===receipt.id).status!=='sold')throw new Error('Sale not persisted');
   if(!online.transactions.some(t=>t.kind==='fish_sale'&&Number(t.amount)>0))throw new Error('Sale missing from transaction history');
   if(!online.purchases.some(t=>t.species_id==='clownfish'&&!('player_id' in t)))throw new Error('Merchant purchase history missing or leaks player');
   if(!hub.body.textContent.includes('Clownfish')||!hub.body.textContent.includes('Merchant purchase history')||!hub.body.textContent.includes(`+${balance} CR`)||!hub.body.textContent.includes(`${balance} CR`))throw new Error('Transaction history or balance not rendered');
   online.offline();
   return {balance,initial,population,saveUnchanged:saved===localStorage.getItem('dsh.save.v2'),dataRestored:before===JSON.stringify(progression.data)};
  },base);
  assert.ok(result.balance>0);assert.equal(result.population,result.initial-1);assert.ok(result.saveUnchanged);assert.ok(result.dataRestored);assert.deepEqual(errors,[]);
  await page.waitForFunction(()=>document.querySelector('#wallet-session')?.textContent==='Online session: Guest (wallet not verified)');
  const walletResult=await page.evaluate(async base=>{
   const {online}=window.__dsh;online.base=base;
   const account=await (await import('/js/wallet.js')).walletAccount();
   return {account,config:await online.api('/api/near/config'),metadata:await online.api('/api/near/metadata')};
  },base);
  assert.equal(walletResult.config.contractId,'deepfish-contract.testnet');assert.equal(walletResult.config.network,'testnet');
  assert.equal(walletResult.metadata.value.symbol,'DSHC');assert.equal(walletResult.metadata.value.name,'Deep Sea Hunter Collectibles (Testnet)');
  assert.ok(walletResult.account===null||typeof walletResult.account==='string');
  console.log('PASS',touch?'mobile landscape':'desktop','merchant order/sale/treasury, guest offline isolation, Testnet metadata, Meteor disconnected probe');
  await page.goto(origin+'/collectibles.html');await page.waitForFunction(()=>document.querySelector('#metadata')?.textContent.includes('DSHC'),null,{timeout:30000});
  assert.match(await page.locator('#identity').textContent(),/deepfish-contract\.testnet/);
  assert.match(await page.locator('#wallet-account').textContent(),/not connected/);
  assert.deepEqual(errors,[]);console.log('PASS',touch?'mobile landscape':'desktop','collectible page read-only metadata, disconnected Meteor status');
  await context.close();
 }
 const page=await browser.newPage();
 for(const name of ['swimming','speargun-rope','living-world','environment-art','world-overhaul']){
  await page.goto(origin+'/tests/'+name+'.html');await page.waitForFunction(()=>/^(PASS|FAIL)/.test(document.querySelector('pre')?.textContent||''),null,{timeout:30000});
  const result=await page.locator('pre').textContent();assert.match(result,/^PASS/);console.log(result);
 }
}finally{await browser?.close();await app.close();await f.close();}
