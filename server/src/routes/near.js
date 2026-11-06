import { config } from '../config/env.js';
import { challenge,bindWallet,view,reconcile } from '../services/near.js';
import { fail } from '../services/transaction.js';
const text=(max=100)=>({type:'string',minLength:1,maxLength:max});
const body=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
export async function nearRoutes(app){
 const auth={preHandler:app.requireSession};
 app.get('/api/near/config',()=>({network:'testnet',contractId:config.nearContractId,enabled:!!config.nearContractId,settlement:config.nearContractId?'testnet_pending_verification':'not_configured'}));
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
