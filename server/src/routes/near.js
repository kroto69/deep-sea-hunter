import { config } from '../config/env.js';
import { challenge,bindWallet,view,reconcile,verifyMerchantTransaction } from '../services/near.js';
import { fail } from '../services/transaction.js';
const text=(max=100)=>({type:'string',minLength:1,maxLength:max});
const body=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const viewAt=(contractId,method,args)=>view(method,args,contractId);
export async function nearRoutes(app){
 const auth={preHandler:app.requireSession};
 app.get('/api/near/config',()=>({network:'testnet',contractId:config.nearContractId,enabled:!!config.nearContractId,settlement:config.nearContractId?'testnet_pending_verification':'not_configured',merchantContractId:config.merchantContractId,merchantEnabled:!!config.merchantContractId}));
 app.get('/api/merchant-chain/state/:accountId',{schema:{params:body({accountId:{type:'string',pattern:'^[a-z0-9][a-z0-9_.-]{0,62}[a-z0-9]$'}})}},async r=>{
   const id=config.merchantContractId,accountId=r.params.accountId;if(!id)fail('merchant_contract_not_configured',503);
   const [merchant,tokens,balance,claim,storage,firstOrder]=await Promise.all([
     viewAt(id,'merchant_id',{}),viewAt(id,'mt_tokens_for_owner',{account_id:accountId}),viewAt(id,'balance_of',{account_id:accountId}),
     viewAt(id,'seller_claim',{account_id:accountId}),viewAt(id,'storage_balance_of',{id:accountId}),viewAt(id,'purchase_order',{order_id:'order-1'})
   ]);
   // Current Testnet merchant uses order-1; avoid serial RPC probes that stall UI sync.
   const sellable=new Map(),o=firstOrder.value;
   if(o?.active&&o.quantity>0&&o.expires_at>Date.now())sellable.set(o.token_id,{id:'order-1',unitPrice:BigInt(o.unit_price).toString(),expiresAt:o.expires_at});
   return {network:'testnet',contractId:id,accountId,merchant:merchant.value,nativeBalance:balance.value,sellerClaim:claim.value,storage:storage.value,
     tokens:(tokens.value||[]).map(t=>({tokenId:t.token_id,title:t.token_metadata?.title||t.token_id,order:sellable.get(t.token_id)||null}))};
 });
 app.get('/api/merchant-chain/config',()=>({network:'testnet',contractId:config.merchantContractId,enabled:!!config.merchantContractId,settlement:config.merchantContractId?'not_verified':'not_configured'}));
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
