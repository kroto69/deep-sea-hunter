// Local Sandbox exercises NEP-245 receiver callbacks and unresolved-transfer reservation.
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
  const receiverWasm=process.env.RECEIVER_WASM||fileURLToPath(new URL('./test-receiver/target/wasm32-unknown-unknown/release/deepfish_nep245_test_receiver.wasm',import.meta.url));
  console.log(`MERCHANT_WASM_SHA256 ${createHash('sha256').update(readFileSync(wasm)).digest('hex')}`);
  console.log(`RECEIVER_WASM_SHA256 ${createHash('sha256').update(readFileSync(receiverWasm)).digest('hex')}`);
  const contract=await root.devDeploy(wasm), receiver=await root.devDeploy(receiverWasm), gas='300000000000000';
  await receiver.call(receiver,'new',{}, {gas});
  await owner.call(contract,'new',{owner_id:owner.accountId,merchant_id:merchant.accountId,treasury_id:treasury.accountId,max_trade:'1000000000000000000000000',name:'Deepfish Merchant',symbol:'DFM'},{gas});
  const min=BigInt((await contract.view('storage_balance_bounds',{})).min);
  for(const account of [owner,seller]) await account.call(contract,'storage_deposit',{},{attachedDeposit:min.toString(),gas});
  await receiver.call(contract,'storage_deposit',{account_id:receiver.accountId},{attachedDeposit:(min+10n**24n).toString(),gas});

  const fundShortfall=async(account,method,args)=>{
    for(let attempt=0;attempt<8;attempt++){
      const result=await account.callRaw(contract,method,args,{attachedDeposit:'1',gas});
      if(result.succeeded)return result;
      const failure=JSON.stringify(result.receiptFailureMessages);
      const match=failure.match(/Insufficient storage balance: (\S+) requires (\d+), has (\d+)/);
      assert(match,`${method} failed: ${failure}`);
      const payer=[owner,seller,receiver].find(a=>a.accountId===match[1]);
      assert(payer,`unknown storage payer ${match[1]}`);
      await payer.call(contract,'storage_deposit',{account_id:payer.accountId},{attachedDeposit:(BigInt(match[2])-BigInt(match[3])).toString(),gas});
      if(attempt===7)throw new Error(`${method} exceeded storage funding retries`);
    }
  };
  const token='fish:sandbox-callback-0001';
  await fundShortfall(owner,'mint_asset',{asset_id:'sandbox-callback-0001',player_id:seller.accountId,species_id:'clownfish',title:'Callback Clownfish'});

  const balance=async(account)=>contract.view('mt_balance_of',{account_id:account,token_id:token});
  const transferCall=async(msg)=>seller.call(contract,'mt_transfer_call',{receiver_id:receiver.accountId,token_id:token,amount:'1',approval:null,memo:null,msg},{attachedDeposit:'1',gas});
  for(const mode of ['return','fail','invalid','spend']){
    const tx=await seller.callRaw(contract,'mt_transfer_call',{receiver_id:receiver.accountId,token_id:token,amount:'1',approval:null,memo:null,msg:mode},{attachedDeposit:'1',gas});
    assert(tx.succeeded,`${mode}: transfer call failed: ${JSON.stringify(tx.receiptFailureMessages)}`);
    if(mode==='spend')assert(tx.receiptFailureMessages.some(message=>message.includes('Insufficient token balance')), `retransfer while unresolved must fail: ${tx.receiptFailureMessages.join('; ')}`);
    assert.equal(await balance(seller.accountId),'1',`${mode}: sender refunded`);
    assert.equal(await balance(receiver.accountId),'0',`${mode}: receiver balance cleared`);
  }
  const accepted=await seller.callRaw(contract,'mt_transfer_call',{receiver_id:receiver.accountId,token_id:token,amount:'1',approval:null,memo:null,msg:'keep'},{attachedDeposit:'1',gas});
  assert(accepted.succeeded,`accepted transfer failed: ${JSON.stringify(accepted.receiptFailureMessages)}`);
  assert.equal(await balance(seller.accountId),'0','accepted transfer debits sender');
  assert.equal(await balance(receiver.accountId),'1','accepted transfer credits receiver');
  assert.equal(await contract.view('mt_supply',{token_id:token}),'1','supply invariant');
  console.log(JSON.stringify({status:'PASS_LOCAL_SANDBOX_TRANSFER_CALL',cases:{returnedUnused:true,receiverFailure:true,invalidResponse:true,retransferWhilePendingRejected:true,acceptedByReceiver:true},balances:{seller:await balance(seller.accountId),receiver:await balance(receiver.accountId)},supply:'1'},null,2));
} finally { await worker.tearDown(); }
