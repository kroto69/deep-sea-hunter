import assert from 'node:assert/strict';
if(!process.env.PLAYWRIGHT_MODULE)throw new Error('Set PLAYWRIGHT_MODULE');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH&&{executablePath:process.env.CHROMIUM_PATH}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const [name,viewport] of [['desktop',{width:1280,height:720}],['mobile landscape',{width:844,height:390}]]){
  const context=await browser.newContext({viewport,hasTouch:name!=='desktop',isMobile:name!=='desktop'});
  await context.route('**/js/wallet.js',route=>route.fulfill({contentType:'text/javascript',body:`
   export const WALLETS=[{id:'meteor-wallet',name:'Meteor Wallet'},{id:'my-near-wallet',name:'MyNearWallet'},{id:'here-wallet',name:'HERE Wallet'}];
   export const selectedWallet=()=>localStorage.getItem('dsh.wallet.provider')||'meteor-wallet';
   export const selectWallet=id=>localStorage.setItem('dsh.wallet.provider',id);
   export async function testnetWallet(){
    if(localStorage.getItem('mock.error')==='unavailable')throw Error('Wallet not available');
    return {
     isSignedIn:async()=>!!localStorage.getItem('mock.account'),
     getAccounts:async()=>localStorage.getItem('mock.account')?[{accountId:localStorage.getItem('mock.account')}]:[],
     signIn:async()=>{if(localStorage.getItem('mock.error')==='cancel')throw Error('Request cancelled');localStorage.setItem('mock.account','demo.testnet');},
     signOut:async()=>localStorage.removeItem('mock.account')
    };
   }
   export async function walletAccount(){let w=await testnetWallet();return (await w.isSignedIn())?(await w.getAccounts())[0]?.accountId||null:null;}
  `}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:8080/');await page.waitForFunction(()=>window.__dsh?.online?.walletLogin);
  await page.waitForFunction(()=>document.querySelector('#wallet-state')?.textContent.includes('Guest Mode'));
  assert.equal(await page.locator('#wallet-login').isVisible(),false);
  await page.locator('#welcome-near').click();
  assert.equal(await page.locator('#wallet-connect').isVisible(),true);
  const fit=await page.locator('#wallet-login-panel').evaluate(el=>{const a=el.getBoundingClientRect();return a.left>=0&&a.right<=innerWidth&&a.top>=0&&a.bottom<=innerHeight;});assert.ok(fit);
  await page.locator('#wallet-connect').click();
  assert.equal(await page.locator('[data-provider="meteor-wallet"]').isVisible(),true);
  assert.equal(await page.locator('#wallet-pick').evaluate(el => { const r = el.getBoundingClientRect(); return r.left === 0 && r.top === 0 && r.width === innerWidth && r.height === innerHeight; }), true);
  await page.evaluate(()=>localStorage.setItem('mock.error','cancel'));
  await page.locator('[data-provider="meteor-wallet"]').click();await page.getByText('Wallet request cancelled. Nothing was signed.').waitFor();
  await page.locator('#wallet-pick-back').click();await page.locator('#wallet-toggle').click();await page.locator('#wallet-connect').click();
  await page.evaluate(()=>localStorage.setItem('mock.error','unavailable'));
  await page.locator('#wallet-connect').click();await page.locator('[data-provider="meteor-wallet"]').click();await page.getByText('Meteor Wallet not available. Install or open it, then retry.').waitFor();
  await page.evaluate(()=>{localStorage.removeItem('mock.error');const o=window.__dsh.online;o._api=o.api;o.api=async(path,...rest)=>path==='/api/near/config'?{network:'mainnet',enabled:true,contractId:'deepfish-contract.testnet'}:o._api(path,...rest);});
  await page.locator('#wallet-connect').click();await page.locator('[data-provider="meteor-wallet"]').click();await page.getByText('Network is not Testnet. Wallet login is blocked; Guest Mode still works.').waitFor();
  await page.evaluate(()=>{const o=window.__dsh.online;o.api=o._api;});
  await page.locator('#wallet-connect').click();await page.locator('[data-provider="meteor-wallet"]').click();await page.getByText('Wallet connected · Testnet').waitFor();
  assert.equal(await page.locator('#wallet-account-id').textContent(),'Account: demo.testnet');
  assert.equal(await page.locator('#wallet-session').textContent(),'Online session: none');
  assert.equal(await page.locator('#wallet-disconnect').isVisible(),true);
  await page.reload();await page.waitForFunction(()=>window.__dsh?.online?.walletLogin);
  await page.locator('#welcome-near').click();await page.getByText('Wallet connected · Testnet').waitFor();assert.equal(await page.locator('#wallet-account-id').textContent(),'Account: demo.testnet');
  assert.equal(await page.locator('#wallet-session').textContent(),'Online session: none');
  await page.locator('#wallet-guest').click();
  await page.waitForFunction(()=>localStorage.getItem('mock.account')===null);
  assert.equal(await page.locator('#wallet-login').isVisible(),false);
  await page.locator('#wallet-toggle').click();
  await page.getByText('Wallet not connected · Guest Mode available').waitFor();
  assert.equal(await page.locator('#wallet-connect').isVisible(),true);
  assert.equal(await page.locator('#wallet-account-id').isVisible(),false);
  await page.locator('#wallet-connect').click();await page.locator('[data-provider="meteor-wallet"]').click();await page.getByText('Wallet connected · Testnet').waitFor();
  await page.locator('#wallet-disconnect').click();await page.getByText('Wallet not connected · Guest Mode available').waitFor();
  assert.equal(await page.locator('#wallet-connect').isVisible(),true);
  assert.equal(await page.locator('#wallet-account-id').isVisible(),false);
  for(const [id,label] of [['my-near-wallet','MyNearWallet'],['here-wallet','HERE Wallet']]){
   await page.locator('#wallet-connect').click();
   await page.locator(`[data-provider="${id}"]`).click();await page.getByText('Wallet connected · Testnet').waitFor();
   assert.equal(await page.locator('#wallet-account-id').textContent(),'Account: demo.testnet');
   assert.equal(await page.evaluate(()=>localStorage.getItem('dsh.wallet.provider')),id);
   await page.reload();await page.waitForFunction(()=>window.__dsh?.online?.walletLogin);
   await page.getByText('Wallet connected · Testnet').waitFor();
   assert.equal(await page.evaluate(()=>localStorage.getItem('dsh.wallet.provider')),id);
   await page.locator('#wallet-disconnect').click();await page.getByText('Wallet not connected · Guest Mode available').waitFor();
  }
  await page.locator('#wallet-guest').click();
  assert.deepEqual(errors,[]);
  console.log('PASS SIMULATED',name,'wallet UI guest/cancel/unavailable/wrong network/connect/reload/guest-switch/disconnect');
  await context.close();
 }
 const real=await browser.newPage();
 try{
  await real.goto('http://localhost:8080/');
  await real.waitForFunction(()=>window.__dsh?.online?.walletLogin);
  const accounts=await real.evaluate(async()=>{
   const wallet=await import('./js/wallet.js');
   const result=[];
   for(const {id} of wallet.WALLETS){
    wallet.selectWallet(id);
    result.push({id,account:await wallet.walletAccount()});
   }
   return result;
  });
  assert.deepEqual(accounts,[
   {id:'meteor-wallet',account:null},
   {id:'my-near-wallet',account:null},
   {id:'here-wallet',account:null}
  ]);
  console.log('PASS READ-ONLY real selector modules Meteor/MyNearWallet/HERE disconnected');
 }finally{await real.close();}
}finally{await browser.close();}
