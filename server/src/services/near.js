import { createHash, createPublicKey, verify, randomBytes, randomUUID } from 'node:crypto';
import { config } from '../config/env.js';
import { transaction, fail } from './transaction.js';
import { requireActiveSession } from './sessions.js';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function decode58(text) {
  if(typeof text!=='string'||!text.length||text.length>100) throw new Error('invalid_base58');
  let n=0n; for(const char of text){const i=alphabet.indexOf(char);if(i<0)throw new Error('invalid_base58');n=n*58n+BigInt(i);}
  let hex=n.toString(16);if(hex.length%2)hex='0'+hex;
  return Buffer.concat([Buffer.alloc(text.match(/^1*/)[0].length),n?Buffer.from(hex,'hex'):Buffer.alloc(0)]);
}
const str=value=>{const bytes=Buffer.from(value);const size=Buffer.alloc(4);size.writeUInt32LE(bytes.length);return Buffer.concat([size,bytes]);};
export function messageHash({message,nonce,recipient,callbackUrl}) {
  const tag=Buffer.alloc(4);tag.writeUInt32LE(2147484061);
  if(nonce.length!==32)throw new Error('invalid_nonce');
  return createHash('sha256').update(Buffer.concat([tag,str(message),nonce,str(recipient),Buffer.from([callbackUrl?1:0]),...(callbackUrl?[str(callbackUrl)]:[])])).digest();
}
export function verifyMessage(payload, publicKey, signature) {
  try {
    if(!publicKey.startsWith('ed25519:')||! /^[A-Za-z0-9+/]{86}==$/.test(signature))return false;
    const raw=decode58(publicKey.slice(8));if(raw.length!==32)return false;
    const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),raw]),format:'der',type:'spki'});
    return verify(null,messageHash(payload),key,Buffer.from(signature,'base64'));
  } catch { return false; }
}
export async function rpc(method,params) {
  try {
    const statusResponse=await fetch(config.nearRpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method:'status',params:[]}),signal:AbortSignal.timeout(8000)});
    const status=await statusResponse.json();if(status.result?.chain_id!=='testnet')fail('wrong_chain',503);
    const response=await fetch(config.nearRpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method,params}),signal:AbortSignal.timeout(12000)});
    const json=await response.json();if(!response.ok||json.error)fail('near_rpc_unavailable',503);return json.result;
  } catch(e) {if(e.statusCode)throw e;fail('near_rpc_unavailable',503);}
}
export async function challenge(db,identity){
  const id=randomUUID(),nonce=randomBytes(32),recipient=new URL(config.allowedOrigin).host;
  const message=`Deep Sea Hunter Testnet sign-in. Player ${identity.id}. Challenge ${id}. No transaction or asset approval.`;
  await transaction(db,async c=>{await requireActiveSession(c,identity);await c.query(`INSERT INTO wallet_challenges(id,player_id,session_id,nonce,message,recipient,expires_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '5 minutes')`,[id,identity.id,identity.sessionId,nonce,message,recipient]);});
  return {id,nonce:nonce.toString('base64'),message,recipient,callbackUrl:config.allowedOrigin+'/'};
}
export async function bindWallet(db,identity,body,query=rpc){
  const challenge=(await db.query('SELECT * FROM wallet_challenges WHERE id=$1 AND player_id=$2 AND session_id=$3 AND used_at IS NULL AND expires_at>clock_timestamp()',[body.challengeId,identity.id,identity.sessionId])).rows[0];
  if(!challenge)fail('challenge_expired',401);
  if(!verifyMessage({message:challenge.message,nonce:challenge.nonce,recipient:challenge.recipient,callbackUrl:config.allowedOrigin+'/'},body.publicKey,body.signature))fail('invalid_signature',401);
  const access=await query('query',{request_type:'view_access_key',finality:'final',account_id:body.accountId,public_key:body.publicKey});
  if(access.permission!=='FullAccess')fail('full_access_key_required',401);
  return transaction(db,async c=>{
    await requireActiveSession(c,identity);
    await c.query('SELECT id FROM players WHERE id=$1 FOR UPDATE',[identity.id]);
    const existing=(await c.query('SELECT wallet_account FROM players WHERE id=$1',[identity.id])).rows[0];
    if(existing.wallet_account&&existing.wallet_account!==body.accountId)fail('wallet_already_bound');
    if(!(await c.query('UPDATE wallet_challenges SET used_at=clock_timestamp() WHERE id=$1 AND used_at IS NULL AND expires_at>clock_timestamp()',[body.challengeId])).rowCount)fail('challenge_expired',401);
    await requireActiveSession(c,identity);
    try {await c.query("UPDATE players SET mode='wallet',wallet_account=$2 WHERE id=$1",[identity.id,body.accountId]);}
    catch(e){if(e.code==='23505')fail('wallet_linked_to_other_player');throw e;}
    return {accountId:body.accountId,network:'testnet',verified:true};
  });
}
export async function view(method,args){
  if(!config.nearContractId)fail('contract_not_configured',503);
  const result=await rpc('query',{request_type:'call_function',finality:'final',account_id:config.nearContractId,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')});
  return {blockHash:result.block_hash,blockHeight:result.block_height,value:JSON.parse(Buffer.from(result.result).toString())};
}
export async function reconcile(db,row,query=rpc){
  const saved=(await db.query('SELECT status FROM chain_transactions WHERE hash=$1',[row.hash])).rows[0];
  if(saved&&saved.status!=='pending')return {status:saved.status};
  try{
    const result=await query('EXPERIMENTAL_tx_status',{tx_hash:row.hash,sender_account_id:row.signer_id,wait_until:'FINAL'});
    if(result.final_execution_status!=='FINAL')return {status:'pending'};
    if(result.transaction?.hash!==row.hash||result.transaction?.signer_id!==row.signer_id||result.transaction?.receiver_id!==config.nearContractId)fail('transaction_mismatch',400);
    const successful=Object.hasOwn(result.status||{},'SuccessValue');
    if(!successful&&!Object.hasOwn(result.status||{},'Failure'))return {status:'pending'};
    await transaction(db,async c=>{
      await c.query('SELECT hash FROM chain_transactions WHERE hash=$1 FOR UPDATE',[row.hash]);
      for(const receipt of result.receipts_outcome||[]){
        if(receipt.outcome.executor_id!==config.nearContractId||!Object.hasOwn(receipt.outcome.status||{},'SuccessValue'))continue;
        for(const [index,log] of (receipt.outcome.logs||[]).entries()){
          if(!log.startsWith('EVENT_JSON:'))continue;
          let event;try{event=JSON.parse(log.slice(11));}catch{continue;}
          if(!['nep171','deepfish'].includes(event.standard))continue;
          await c.query('INSERT INTO chain_events(transaction_hash,receipt_id,log_index,event) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[row.hash,receipt.id,index,event]);
        }
      }
      await c.query('UPDATE chain_transactions SET status=$2,checked_at=clock_timestamp(),last_error=NULL WHERE hash=$1',[row.hash,successful?'final':'failed']);
    });
    return {status:successful?'final':'failed'};
  }catch(e){const error=e.code||'rpc_timeout';const terminal=error==='transaction_mismatch';await db.query("UPDATE chain_transactions SET checked_at=clock_timestamp(),last_error=$2,status=$3 WHERE hash=$1 AND status='pending'",[row.hash,error,terminal?'failed':'pending']);return {status:terminal?'failed':'pending',error};}
}
export async function reconcilePending(db){
  if(!config.nearContractId)return;
  const rows=(await db.query("SELECT * FROM chain_transactions WHERE status='pending' AND (checked_at IS NULL OR checked_at<clock_timestamp()-interval '30 seconds') ORDER BY checked_at NULLS FIRST,created_at LIMIT 10")).rows;
  await Promise.all(rows.map(row=>reconcile(db,row)));
}

