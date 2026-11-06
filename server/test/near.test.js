import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomBytes} from 'node:crypto';
import {decode58,messageHash,verifyMessage,challenge,bindWallet,reconcile} from '../src/services/near.js';
import {createGuestSession} from '../src/services/sessions.js';
import {testDatabase} from './database.js';
import {config} from '../src/config/env.js';
function encode58(bytes){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+bytes.toString('hex')),s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}for(const b of bytes){if(b!==0)break;s='1'+s;}return s;}
const key=generateKeyPairSync('ed25519');
const publicKey='ed25519:'+encode58(key.publicKey.export({format:'der',type:'spki'}).subarray(-32));
function signed(c){return {challengeId:c.id,accountId:'demo.testnet',publicKey,signature:sign(null,messageHash({...c,nonce:Buffer.from(c.nonce,'base64')}),key.privateKey).toString('base64')};}
test('NEP-413 verifies signatures and binds nonce recipient callback and message',()=>{
 const p={message:'Deep Sea Hunter',nonce:randomBytes(32),recipient:'localhost:8080',callbackUrl:'http://localhost:8080/'};
 const signature=sign(null,messageHash(p),key.privateKey).toString('base64');
 assert.equal(verifyMessage(p,publicKey,signature),true);
 for(const field of ['message','recipient','callbackUrl'])assert.equal(verifyMessage({...p,[field]:p[field]+'x'},publicKey,signature),false);
 assert.equal(verifyMessage({...p,nonce:randomBytes(32)},publicKey,signature),false);
 assert.equal(verifyMessage(p,publicKey,signature.slice(1)),false);
 assert.equal(verifyMessage(p,'ed25519:0',signature),false);
 assert.deepEqual(decode58('111'),Buffer.alloc(3));assert.throws(()=>decode58('0'));
});
test('wallet binding and chain reconciliation with mocked RPC', {skip:!process.env.TEST_DATABASE_URL},async t=>{
 const f=await testDatabase();t.after(f.close);const db=f.db;
 const session=await createGuestSession(db);const identity={id:session.playerId,sessionId:session.sessionId};
 const c=await challenge(db,identity),body=signed(c);
 await assert.rejects(bindWallet(db,identity,{...body,signature:'bad'},async()=>({permission:'FullAccess'})),/invalid_signature/);
 await assert.rejects(bindWallet(db,identity,body,async()=>({permission:{FunctionCall:{}}})),/full_access_key_required/);
 assert.equal((await bindWallet(db,identity,body,async(method,params)=>{assert.equal(params.account_id,'demo.testnet');assert.equal(params.finality,'final');return {permission:'FullAccess'};})).verified,true);
 await assert.rejects(bindWallet(db,identity,body,async()=>({permission:'FullAccess'})),/challenge_expired/);
 const expired=await challenge(db,identity);await db.query("UPDATE wallet_challenges SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[expired.id]);
 await assert.rejects(bindWallet(db,identity,signed(expired)),/challenge_expired/);
 const second=await createGuestSession(db),other={id:second.playerId,sessionId:second.sessionId},otherChallenge=await challenge(db,other);
 await assert.rejects(bindWallet(db,other,signed(otherChallenge),async()=>({permission:'FullAccess'})),/wallet_linked_to_other_player/);
 const row={hash:'testhash',signer_id:'demo.testnet'};await db.query('INSERT INTO chain_transactions(hash,player_id,signer_id) VALUES($1,$2,$3)',[row.hash,identity.id,row.signer_id]);
 assert.equal((await reconcile(db,row,async()=>{throw new Error('timeout');})).status,'pending');
 assert.equal((await reconcile(db,row,async()=>({final_execution_status:'EXECUTED'}))).status,'pending');
 const result={final_execution_status:'FINAL',transaction:{hash:row.hash,signer_id:row.signer_id,receiver_id:config.nearContractId},status:{SuccessValue:''},receipts_outcome:[{id:'receipt',outcome:{executor_id:config.nearContractId,status:{SuccessValue:''},logs:['EVENT_JSON:'+JSON.stringify({standard:'deepfish',version:'1.0.0',event:'settled',data:[{}]})]}},{id:'untrusted',outcome:{executor_id:'attacker.testnet',status:{SuccessValue:''},logs:['EVENT_JSON:{"standard":"deepfish"}']}}]};
 assert.equal((await reconcile(db,row,async()=>result)).status,'final');await reconcile(db,row,async()=>result);
 assert.equal((await db.query('SELECT count(*)::int n FROM chain_events')).rows[0].n,1);
 assert.equal((await db.query('SELECT mode FROM players WHERE id=$1',[identity.id])).rows[0].mode,'wallet');
});
