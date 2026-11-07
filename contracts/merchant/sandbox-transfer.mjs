// Local Sandbox check for NEP-245 transfer accounting.
import {Worker} from 'near-workspaces';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const worker=await Worker.init();
try {
  const root=worker.rootAccount;
  const [owner,merchant,treasury,player]=await Promise.all(['owner','merchant','treasury','player'].map(n=>root.createSubAccount(n)));
  const wasm=process.env.CONTRACT_WASM||fileURLToPath(new URL('./target/wasm32-unknown-unknown/release/deepfish_merchant_economy.wasm',import.meta.url));
  console.log(`WASM_SHA256 ${createHash('sha256').update(readFileSync(wasm)).digest('hex')}`);
  const contract=await root.devDeploy(wasm);
  const gas='300000000000000';
  const view=(m,a={})=>contract.view(m,a);
  await owner.call(contract,'new',{owner_id:owner.accountId,merchant_id:merchant.accountId,treasury_id:treasury.accountId,max_trade:'1000000000000000000000000',name:'Deepfish Merchant',symbol:'DFM'},{gas});
  const min=BigInt((await view('storage_balance_bounds',{})).min);
  for(const a of [owner,player,merchant]) await a.call(contract,'storage_deposit',{},{attachedDeposit:min.toString(),gas});

  const token='fish:sandbox-fish-0001';
  // Fund mint via measured shortfalls (same loop as the mint stage).
  const snapshot=async()=>({
    supply:await view('mt_supply',{token_id:token}),
    playerBalance:await view('mt_balance_of',{account_id:player.accountId,token_id:token}),
    merchantBalance:await view('mt_balance_of',{account_id:merchant.accountId,token_id:token}),
    owner:await view('storage_balance_of',{account_id:owner.accountId}),
    player:await view('storage_balance_of',{account_id:player.accountId}),
    merchant:await view('storage_balance_of',{account_id:merchant.accountId}),
  });
  const mintArgs={asset_id:'sandbox-fish-0001',player_id:player.accountId,species_id:'clownfish',title:'Sandbox Clownfish'};
  for(let i=0;i<8;i++){
    const res=await owner.callRaw(contract,'mint_asset',mintArgs,{attachedDeposit:'1',gas});
    if(res.succeeded) break;
    const m=JSON.stringify(res.receiptFailureMessages).match(/Insufficient storage balance: (\S+) requires (\d+), has (\d+)/);
    assert(m,'mint failed unexpectedly');
    const payer=[owner,player,merchant].find(a=>a.accountId===m[1]);
    await payer.call(contract,'storage_deposit',{},{attachedDeposit:(BigInt(m[2])-BigInt(m[3])).toString(),gas});
    if(i===7) throw new Error('mint never succeeded');
  }
  assert.equal(await view('mt_balance_of',{account_id:player.accountId,token_id:token}),'1');

  // Merchant has only the registration minimum: transfer must fail and leave state untouched.
  const args={receiver_id:merchant.accountId,token_id:token,amount:'1',approval:null,memo:'sandbox transfer'};
  const s0=await snapshot();
  const rejected=await player.callRaw(contract,'mt_transfer',args,{attachedDeposit:'1',gas});
  assert(!rejected.succeeded,'transfer must fail without receiver storage');
  const m=JSON.stringify(rejected.receiptFailureMessages).match(/Insufficient storage balance: (\S+) requires (\d+), has (\d+)/);
  assert(m&&m[1]===merchant.accountId,'receiver (merchant) must be the payer');
  assert.deepEqual(await snapshot(),s0,'state changed after failed transfer');
  const shortfall=BigInt(m[2])-BigInt(m[3]);
  await merchant.call(contract,'storage_deposit',{},{attachedDeposit:shortfall.toString(),gas});

  // Unregistered receiver is rejected.
  const stranger=await root.createSubAccount('stranger');
  const s1=await snapshot();
  const unreg=await player.callRaw(contract,'mt_transfer',{...args,receiver_id:stranger.accountId},{attachedDeposit:'1',gas});
  assert(!unreg.succeeded && JSON.stringify(unreg.receiptFailureMessages).includes('Token receiver not registered'));
  assert.deepEqual(await snapshot(),s1,'state changed after unregistered transfer');

  const before=await snapshot();
  const tx=await player.callRaw(contract,'mt_transfer',args,{attachedDeposit:'1',gas});
  assert(tx.succeeded,'transfer failed');

  // Insufficient balance: player now has 0.
  const s2=await snapshot();
  const empty=await player.callRaw(contract,'mt_transfer',args,{attachedDeposit:'1',gas});
  assert(!empty.succeeded && JSON.stringify(empty.receiptFailureMessages).includes('Insufficient token balance'));
  assert.deepEqual(await snapshot(),s2,'state changed after insufficient-balance transfer');

  const after=await snapshot();
  assert.equal(after.playerBalance,'0');
  assert.equal(after.merchantBalance,'1');
  assert.equal(after.supply,'1','supply unchanged');

  const charges=tx.logs.filter(l=>l.startsWith('STORAGE_CHARGE ')).map(l=>JSON.parse(l.slice(15)));
  assert.equal(charges.length,2,'expected sender + receiver groups');
  const sender=charges[0], receiver=charges[1];
  assert.equal(sender.account,player.accountId);
  assert.equal(receiver.account,merchant.accountId);
  const event=JSON.parse(tx.logs.find(l=>l.startsWith('EVENT_JSON:')).slice(11));
  assert.equal(event.standard,'nep245'); assert.equal(event.event,'mt_transfer');
  assert.equal(event.data[0].old_owner_id,player.accountId);
  assert.equal(event.data[0].new_owner_id,merchant.accountId);
  assert.deepEqual(event.data[0].token_ids,[token]);
  assert.deepEqual(event.data[0].amounts,['1']);
  assert.equal(event.data[0].memo,'sandbox transfer');
  assert(!Object.hasOwn(JSON.parse(tx.logs.find(l=>l.startsWith('EVENT_JSON:')).slice(11)),'unused'),'event wrapper shape');

  // Storage: player's entry removed (refunded), merchant's entry created (charged).
  const playerFreedBytes=BigInt(sender.before)-BigInt(sender.after); // removal => positive bytes freed
  const merchantNewBytes=BigInt(receiver.after)-BigInt(receiver.before);
  assert(playerFreedBytes>0,'sender entry removed');
  assert(merchantNewBytes>0,'receiver entry created');
  const playerFreed=playerFreedBytes*BigInt(sender.byte_cost), merchantCharged=merchantNewBytes*BigInt(receiver.byte_cost);
  // Deposits (total) never move on charge; only the used portion does, so available shifts.
  assert.equal(after.player.total,before.player.total); assert.equal(after.merchant.total,before.merchant.total);
  assert.equal(BigInt(after.player.available),BigInt(before.player.available)+playerFreed,'player available grows by freed bytes');
  assert.equal(BigInt(after.merchant.available),BigInt(before.merchant.available)-merchantCharged,'merchant available drops by new bytes');
  assert.equal(merchantCharged,shortfall,'merchant shortfall equals measured charge');
  assert.equal(after.merchant.available,'0');
  console.log(JSON.stringify({status:'PASS_LOCAL_SANDBOX_TRANSFER',contract:contract.accountId,
    balances:{player:after.playerBalance,merchant:after.merchantBalance,supply:after.supply},
    storage:{playerFreedBytes:playerFreedBytes.toString(),playerDeposit:playerFreed.toString(),
      merchantNewBytes:merchantNewBytes.toString(),merchantCost:merchantCharged.toString(),
      merchantShortfallFunded:shortfall.toString(),player:{before:before.player,after:after.player},merchant:{before:before.merchant,after:after.merchant}},
    rejected:{noReceiverStorage:true,unregisteredReceiver:true,insufficientBalance:true,stateUnchanged:true},
    event},null,2));
} finally { await worker.tearDown(); }