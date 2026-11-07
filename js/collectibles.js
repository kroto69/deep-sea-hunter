import { testnetWallet, walletAccount, selectWallet, selectedWallet, WALLETS } from './wallet.js';
const $=id=>document.getElementById(id),base='https://deep-sea-hunter-api.onrender.com';
let config,busy=false;
const status=text=>{$('status').textContent=text;};
async function api(path,body){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${sessionStorage.getItem('dsh.online.token')||''}`,...(body&&{'content-type':'application/json'})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok)throw new Error(result.error||`HTTP ${response.status}`);return result;}
function token(){const id=$('token').value.trim();if(!/^collectible-[A-Za-z0-9_-]{1,52}$/.test(id))throw new Error('Invalid collectible ID');return id;}
function near(value){if(!/^(?:0|[1-9]\d{0,3})(?:\.\d{1,24})?$/.test(value))throw new Error('Invalid test NEAR amount');const [whole,fraction='']=value.split('.');const n=BigInt(whole)*10n**24n+BigInt(fraction.padEnd(24,'0'));if(n<=0n||n>1000n*10n**24n)throw new Error('Price must be >0 and <=1000 test NEAR');return n.toString();}
async function lookup(){const data=await api('/api/collectibles/'+encodeURIComponent(token()));$('detail').textContent=JSON.stringify(data,null,2);return data;}
function pending(){try{return JSON.parse(sessionStorage.getItem('dsh.chain.pending')||'[]');}catch{return [];}}
function remember(hash){if(!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(hash))throw new Error('Invalid transaction hash');sessionStorage.setItem('dsh.chain.pending',JSON.stringify([...new Set([...pending(),hash])]));}
async function sync(){for(const hash of pending()){const result=await api('/api/chain/transactions',{hash});if(result.status!=='pending')sessionStorage.setItem('dsh.chain.pending',JSON.stringify(pending().filter(h=>h!==hash)));}const rows=await api('/api/chain/transactions');$('transactions').textContent=JSON.stringify(rows,null,2);return rows;}
async function transact(method,args,deposit){
 const player=await api('/api/player');const wallet=await testnetWallet(),accounts=await wallet.getAccounts();
 if(!player.wallet_account||!accounts.some(a=>a.accountId===player.wallet_account))throw new Error('Verify matching Testnet wallet in game first');
 const result=await wallet.signAndSendTransaction({signerId:player.wallet_account,receiverId:config.contractId,actions:[{type:'FunctionCall',params:{methodName:method,args,gas:'100000000000000',deposit}}],callbackUrl:location.origin+location.pathname});
 if(result?.transaction?.hash){remember(result.transaction.hash);await sync();}else status('Wallet redirect pending. No settlement assumed.');
}
async function showWallet(){const id=await walletAccount();$('wallet-account').textContent=id?`${WALLETS.find(w=>w.id===selectedWallet())?.name}: ${id}`:'Wallet: not connected';$('wallet-provider').disabled=!!id;}
async function action(name){
 if(busy)return;busy=true;$('actions').disabled=true;status('Waiting for confirmation…');
 try{
  if(name==='connect'){selectWallet($('wallet-provider').value);const wallet=await testnetWallet();if(!await walletAccount())await wallet.signIn({contractId:config.contractId});await showWallet();}
  if(name==='disconnect'){await(await testnetWallet()).signOut();await showWallet();}
  if(name==='lookup')await lookup();
  if(name==='register')await transact('register',{},'10000000000000000000000');
  if(name==='withdraw'||name==='unregister')await transact(name,{},'1');
  if(name==='list')await transact('list',{token_id:token(),price:near($('price').value),expires_at:((BigInt(Date.now())+86400000n)*1000000n).toString()},'10000000000000000000000');
  if(name==='delist')await transact('delist',{token_id:token()},'1');
  if(name==='buy'){const data=await lookup();if(!data.listing.value)throw new Error('Not listed');await transact('buy',{token_id:token()},data.listing.value.price);}
  if(name==='transfer'){const receiver=$('receiver').value.trim();if(!/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.testnet$/.test(receiver)&&!/^[a-f0-9]{64}$/.test(receiver))throw new Error('Testnet recipient or implicit account required');await transact('nft_transfer',{token_id:token(),receiver_id:receiver},'1');}
  if(name==='sync')await sync();
  status('Request completed. See final/pending/failed status below; never infer settlement from wallet return alone.');
 }catch(error){status(error.message+' — retry sync after network recovery.');}
 finally{busy=false;$('actions').disabled=!config?.enabled;}
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button)action(button.dataset.action);});$('sync').onclick=()=>action('sync');
try{
 config=await api('/api/near/config');if(config.network!=='testnet')throw new Error('Only Testnet supported');
 $('wallet-provider').value=selectedWallet();
 $('actions').disabled=!config.enabled;$('identity').textContent=config.contractId||'No contract configured';
 if(config.enabled){await showWallet();$('metadata').textContent=JSON.stringify(await api('/api/near/metadata'),null,2);}
 const params=new URLSearchParams(location.search);const hashes=params.get('transactionHashes');const walletError=params.get('errorMessage');
 if(hashes){for(const hash of hashes.split(','))remember(hash);history.replaceState(null,'',location.pathname);await sync();}
 status(walletError|| (config.enabled?'Testnet only. Verify wallet in game before trading.':'BLOCKED: contract not configured. Offline and Online Guest remain playable.'));
}catch(error){status(error.message);}
