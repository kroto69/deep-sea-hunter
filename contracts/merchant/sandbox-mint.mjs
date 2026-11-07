// Local Sandbox check for mint storage accounting. Funds each payer only with the
// shortfall reported by the contract, so every deposit comes from runtime measurement.
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
  await owner.call(contract,'new',{owner_id:owner.accountId,merchant_id:merchant.accountId,treasury_id:treasury.accountId,max_trade:'1000000000000000000000000',name:'Deepfish Merchant',symbol:'DFM'},{gas});
  const min=BigInt((await contract.view('storage_balance_bounds',{})).min);
  // Registration only: minimum deposit, no extra funds for token storage.
  for(const a of [owner,player]) await a.call(contract,'storage_deposit',{},{attachedDeposit:min.toString(),gas});

  const token='fish:sandbox-fish-0001', title='Sandbox Clownfish';
  const mintArgs={asset_id:'sandbox-fish-0001',player_id:player.accountId,species_id:'clownfish',title};
  const snapshot=async()=>({
    supply:await contract.view('mt_supply',{token_id:token}),
    metadata:(await contract.view('mt_metadata_token_by_token_id',{token_ids:[token]}))[0],
    balance:await contract.view('mt_balance_of',{account_id:player.accountId,token_id:token}),
    asset:await contract.view('asset',{asset_id:`legacy:${title}`}),
    // ponytail: impl param is named `id`, not NEP-145 `account_id`; fix in NEP audit stage.
    owner:await contract.view('storage_balance_of',{account_id:owner.accountId}),
    player:await contract.view('storage_balance_of',{account_id:player.accountId}),
    storageUsage:(await worker.provider.viewAccount(contract.accountId)).storage_usage,
  });

  const failures=[];
  let success, before;
  for(let attempt=0;attempt<8&&!success;attempt++){
    before=await snapshot();
    const res=await owner.callRaw(contract,'mint_asset',mintArgs,{attachedDeposit:'1',gas});
    if(res.succeeded){ success=res; break; }
    const msg=JSON.stringify(res.receiptFailureMessages);
    const m=msg.match(/Insufficient storage balance: (\S+) requires (\d+), has (\d+)/);
    assert(m,`unexpected failure: ${msg}`);
    const [,account,required,has]=m;
    // Failed receipt must leave every mint-related value untouched.
    assert.deepEqual(await snapshot(),before,'state changed after failed mint');
    const shortfall=BigInt(required)-BigInt(has);
    failures.push({account,required,has,shortfall:shortfall.toString(),stateUnchanged:true});
    const payer=account===owner.accountId?owner:account===player.accountId?player:null;
    assert(payer,`unexpected payer ${account}`);
    await payer.call(contract,'storage_deposit',{},{attachedDeposit:shortfall.toString(),gas});
  }
  assert(success,'mint never succeeded');

  const charges=success.logs.filter(l=>l.startsWith('STORAGE_CHARGE ')).map(l=>JSON.parse(l.slice(15)));
  assert.equal(charges.length,4,'expected four storage groups');
  const groups=['metadata','supply','balance','legacy_asset'];
  const expectedPayer=[owner,owner,player,owner].map(a=>a.accountId);
  const rows=charges.map((c,i)=>{
    assert.equal(c.account,expectedPayer[i],`${groups[i]} payer`);
    const bytes=c.after-c.before; assert(bytes>0,`${groups[i]} bytes`);
    return {group:groups[i],payer:c.account,bytes,byteCost:String(c.byte_cost),cost:(BigInt(bytes)*BigInt(c.byte_cost)).toString()};
  });
  const event=success.logs.find(l=>l.startsWith('EVENT_JSON:'));
  assert(event,'mt_mint event missing');
  const ev=JSON.parse(event.slice(11));
  assert.equal(ev.standard,'nep245'); assert.equal(ev.event,'mt_mint');
  assert.equal(ev.data[0].owner_id,player.accountId); assert.deepEqual(ev.data[0].token_ids,[token]);

  const after=await snapshot();
  assert.equal(after.supply,'1'); assert.equal(after.balance,'1');
  assert.equal(after.metadata.title,title);
  assert.equal(after.asset.owner_id,player.accountId);
  // Storage totals must equal minimum + charged groups; nothing left free.
  const sum=acct=>rows.filter(r=>r.payer===acct).reduce((s,r)=>s+BigInt(r.cost),0n);
  for(const [a,bal] of [[owner.accountId,after.owner],[player.accountId,after.player]]){
    assert.equal(BigInt(bal.total),min+sum(a),`${a} total`);
    assert.equal(bal.available,'0',`${a} available`);
  }
  console.log(JSON.stringify({status:'PASS_LOCAL_SANDBOX_MINT',contract:contract.accountId,registrationMinimum:min.toString(),failures,groups:rows,
    totals:{owner:sum(owner.accountId).toString(),player:sum(player.accountId).toString()},
    // Account-level storage_usage also counts trie overhead; reported, not asserted equal.
    contractStorageUsage:{beforeMint:before.storageUsage,afterMint:after.storageUsage,groupBytes:rows.reduce((s,r)=>s+r.bytes,0)},
    final:{supply:after.supply,balance:after.balance,assetOwner:after.asset.owner_id,owner:after.owner,player:after.player},event:ev},null,2));
} finally { await worker.tearDown(); }
