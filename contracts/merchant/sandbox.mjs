// Local Sandbox: full economy loop. mint -> order -> sell -> claim -> withdraw.
// Storage is funded only with the shortfall the contract reports (measured, not guessed).
import {Worker} from 'near-workspaces';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const worker=await Worker.init();
try {
  const root=worker.rootAccount;
  const [owner,merchant,treasury,seller]=await Promise.all(['owner','merchant','treasury','seller'].map(n=>root.createSubAccount(n)));
  const wasm=process.env.CONTRACT_WASM||fileURLToPath(new URL('./target/wasm32-unknown-unknown/release/deepfish_merchant_economy.wasm',import.meta.url));
  console.log(`WASM_SHA256 ${createHash('sha256').update(readFileSync(wasm)).digest('hex')}`);
  const contract=await root.devDeploy(wasm);
  const gas='300000000000000';
  const accounts=[owner,merchant,treasury,seller];
  const funded={};
  // Call; on "Insufficient storage balance" top up exactly the shortfall for that payer and retry.
  const call=async(who,method,args={},deposit='0')=>{
    for(let i=0;i<8;i++){
      const res=await who.callRaw(contract,method,args,{attachedDeposit:deposit,gas});
      if(res.succeeded) return res;
      const msg=JSON.stringify(res.receiptFailureMessages);
      const m=msg.match(/Insufficient storage balance: (\S+) requires (\d+), has (\d+)/);
      if(!m) throw new Error(`${method} failed: ${msg}`);
      const payer=accounts.find(a=>a.accountId===m[1]);
      const shortfall=BigInt(m[2])-BigInt(m[3]);
      funded[m[1]]=((BigInt(funded[m[1]]||0))+shortfall).toString();
      await payer.call(contract,'storage_deposit',{},{attachedDeposit:shortfall.toString(),gas});
    }
    throw new Error(`${method} never succeeded`);
  };
  const yocto=10n**24n;
  await owner.call(contract,'new',{owner_id:owner.accountId,merchant_id:merchant.accountId,treasury_id:treasury.accountId,max_trade:yocto.toString(),name:'Deepfish Merchant',symbol:'DFM'},{gas});
  const min=(await contract.view('storage_balance_bounds',{})).min;
  for(const a of [owner,merchant,seller]) await a.call(contract,'storage_deposit',{},{attachedDeposit:min,gas});

  const id='fish:sandbox-fish-0001', price=yocto/100n;
  await owner.call(contract,'fund_treasury',{},{attachedDeposit:(yocto/10n).toString(),gas});
  await call(owner,'mint_asset',{asset_id:'sandbox-fish-0001',player_id:seller.accountId,species_id:'clownfish',title:'Sandbox Clownfish'},'1');
  const block=await worker.provider.block({finality:'final'});
  const expiresAt=Math.floor(Number(BigInt(block.header.timestamp_nanosec)/1_000_000n))+3_600_000;
  await call(owner,'create_purchase_order',{order_id:'order-1',token_id:id,quantity:'1',unit_price:price.toString(),expires_at:expiresAt},'1');
  assert.equal(await contract.view('reserved_orders',{}),price.toString());

  // Web UI discovers orders by probing order-1..N.
  const probed=await contract.view('purchase_order',{order_id:'order-1'});
  assert(probed && probed.token_id===id,'order-1 probe used by the web UI failed');
  const sell=await call(seller,'accept_purchase_order',{order_id:'order-1',amount:'1'},'1');
  assert.equal(await contract.view('mt_balance_of',{account_id:merchant.accountId,token_id:id}),'1');
  assert.equal(await contract.view('mt_balance_of',{account_id:seller.accountId,token_id:id}),'0');
  assert.equal(await contract.view('mt_supply',{token_id:id}),'1');
  assert.equal(await contract.view('seller_claim',{account_id:seller.accountId}),price.toString());
  assert.equal(await contract.view('reserved_orders',{}),'0');
  assert.equal(await contract.view('accounting_invariant',{}),true);
  const transferEvent=sell.logs.find(l=>l.includes('"mt_transfer"'));
  assert(transferEvent,'mt_transfer event missing');

  const beforeStorage=(await contract.view('storage_balance_of',{account_id:seller.accountId}));
  assert(BigInt(beforeStorage.total) >= BigInt((await contract.view('storage_balance_bounds',{})).min), 'seller storage fell below registration minimum');

  const before=BigInt((await worker.provider.viewAccount(seller.accountId)).amount);
  const withdrawal=await call(seller,'withdraw_proceeds',{},'1');
  const after=BigInt((await worker.provider.viewAccount(seller.accountId)).amount);
  assert(after>before,'seller wallet did not grow');
  assert.equal(await contract.view('seller_claim',{account_id:seller.accountId}),'0');
  assert.equal(await contract.view('paid_out',{}),price.toString());
  assert.equal(await contract.view('accounting_invariant',{}),true);

  // Second withdrawal must fail: no double payout.
  const again=await seller.callRaw(contract,'withdraw_proceeds',{},{attachedDeposit:'1',gas});
  assert(!again.succeeded && JSON.stringify(again.receiptFailureMessages).includes('No proceeds'));

  console.log(JSON.stringify({status:'PASS_LOCAL_SANDBOX_ECONOMY',contract:contract.accountId,
    tx:{sell:sell.result.transaction.hash,withdraw:withdrawal.result.transaction.hash},
    storageShortfallFunded:funded,
    native:{price:price.toString(),sellerBefore:before.toString(),sellerAfter:after.toString(),sellerNetGain:(after-before).toString(),paidOut:price.toString()},
    fish:{merchant:'1',seller:'0',supply:'1'},sellerStorage:beforeStorage.total,transferEvent},null,2));
} finally { await worker.tearDown(); }
