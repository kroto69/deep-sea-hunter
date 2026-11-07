import { config } from '../config/env.js';
import { challenge,bindWallet,view,reconcile,verifyMerchantTransaction } from '../services/near.js';
import { receiptSignature, recordMint, settlementPublicKey } from '../services/settlement.js';
import { fail } from '../services/transaction.js';
import { chainState, signerAvailable } from '../services/merchant-agent.js';
const text=(max=100)=>({type:'string',minLength:1,maxLength:max});
const uuid={type:'string',format:'uuid'};
const body=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const viewAt=(contractId,method,args)=>view(method,args,contractId);
export async function nearRoutes(app){
 const auth={preHandler:app.requireSession};
 app.get('/api/near/config',()=>({network:'testnet',contractId:config.nearContractId,enabled:!!config.nearContractId,settlement:config.nearContractId?'testnet_pending_verification':'not_configured',merchantContractId:config.merchantContractId,merchantEnabled:!!config.merchantContractId}));
 app.get('/api/merchant-chain/state/:accountId',{schema:{params:body({accountId:{type:'string',pattern:'^[a-z0-9][a-z0-9_.-]{0,62}[a-z0-9]$'}})}},async r=>{
   const id=config.merchantContractId,accountId=r.params.accountId;if(!id)fail('merchant_contract_not_configured',503);
   const [merchant,tokens,balance,claim,storage,agent]=await Promise.all([
     viewAt(id,'merchant_id',{}),viewAt(id,'mt_tokens_for_owner',{account_id:accountId}),viewAt(id,'balance_of',{account_id:accountId}),
     viewAt(id,'seller_claim',{account_id:accountId}),viewAt(id,'storage_balance_of',{account_id:accountId}),chainState(accountId).catch(()=>null)
   ]);
   // Agent keys orders by token: order-<token_id>. Legacy demo order stays as order-1.
   const ids=(tokens.value||[]).map(t=>t.token_id);
   const probes=await Promise.all(['order-1',...ids.map(t=>'order-'+t)].map(async o=>({o,v:(await viewAt(id,'purchase_order',{order_id:o}).catch(()=>null))?.value})));
   const sellable=new Map();
   for(const {o,v} of probes) if(v?.active&&v.quantity>0&&v.expires_at>Date.now()&&!sellable.has(v.token_id))sellable.set(v.token_id,{id:o,unitPrice:BigInt(v.unit_price).toString(),expiresAt:v.expires_at});
   return {network:'testnet',contractId:id,accountId,merchant:merchant.value,nativeBalance:balance.value,sellerClaim:claim.value,storage:storage.value,
     agent,merchantBroke:!!agent&&BigInt(agent.availableTreasury)===0n,
     autoMint:config.autoMint&&await signerAvailable(),
     tokens:(tokens.value||[]).map(t=>({tokenId:t.token_id,title:t.token_metadata?.title||t.token_id,order:sellable.get(t.token_id)||null}))};
 });
 app.get('/api/merchant-chain/config',()=>({network:'testnet',contractId:config.merchantContractId,enabled:!!config.merchantContractId,settlement:config.merchantContractId?'not_verified':'not_configured'}));
 // Invisible settlement: the public key the owner publishes on the contract
 // with set_settlement_key, and the per-receipt signature the catcher needs
 // for mint_catch. The key itself never leaves the server.
 app.get('/api/near/settlement-key',()=>{if(!config.settlementSigningKey)fail('settlement_not_configured',503);return {publicKey:settlementPublicKey(config.settlementSigningKey),contractId:config.merchantContractId};});
 app.post('/api/near/receipt-signature',{...auth,schema:{body:body({receiptId:uuid})}},r=>receiptSignature(app.pg,r.player,r.body.receiptId));
 // After the browser mints via mint_catch, record the token on the receipt
 // so the off-chain CR sale refuses a tokenized fish (see settlement.js).
 app.post('/api/near/record-mint',{...auth,schema:{body:body({receiptId:uuid})}},r=>recordMint(app.pg,r.player,r.body.receiptId));
 app.get('/api/merchant-chain/transactions/:hash',{schema:{params:body({hash:{type:'string',pattern:'^[1-9A-HJ-NP-Za-km-z]{43,44}$'}}),querystring:body({accountId:{type:'string',pattern:'^[a-z0-9][a-z0-9_.-]{0,62}[a-z0-9]$'}})}},async r=>{
   if(!config.merchantContractId)fail('merchant_contract_not_configured',503);
   return verifyMerchantTransaction(r.params.hash,r.query.accountId);
 });
 app.get('/api/near/metadata',async()=>view('nft_metadata',{}));
 app.post('/api/wallet/challenge',{...auth,schema:{body:body({})}},r=>challenge(app.pg,r.player));
 app.post('/api/wallet/verify',{...auth,schema:{body:body({challengeId:{type:'string',format:'uuid'},accountId:{type:'string',pattern:'^[a-z0-9][a-z0-9_.-]{0,62}[a-z0-9]$'},publicKey:text(60),signature:text(100)})}},r=>bindWallet(app.pg,r.player,r.body));
 app.post('/api/chain/transactions',{...auth,schema:{body:body({hash:{type:'string',pattern:'^[1-9A-HJ-NP-Za-km-z]{43,44}$'}})}},async r=>{
   if(!config.nearContractId)fail('contract_not_configured',503);
   const p=(await app.pg.query('SELECT wallet_account FROM players WHERE id=$1',[r.player.id])).rows[0];
   if(!p.wallet_account)fail('wallet_not_verified',401);
   await app.pg.query('INSERT INTO chain_transactions(hash,player_id,signer_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[r.body.hash,r.player.id,p.wallet_account]);
   const row=(await app.pg.query('SELECT * FROM chain_transactions WHERE hash=$1 AND player_id=$2',[r.body.hash,r.player.id])).rows[0];
   if(!row)fail('transaction_not_found',404);return reconcile(app.pg,row);
 });
 app.get('/api/chain/transactions',auth,async r=>(await app.pg.query('SELECT * FROM chain_transactions WHERE player_id=$1 ORDER BY created_at DESC LIMIT 50',[r.player.id])).rows);
 app.get('/api/collectibles/:id',{...auth,schema:{params:body({id:text(64)})}},async r=>({token:await view('nft_token',{token_id:r.params.id}),listing:await view('listing',{token_id:r.params.id})}));
}
