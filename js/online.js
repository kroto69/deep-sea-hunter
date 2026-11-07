import { Progression, ZONES } from './progression.js';
import { FISH_SPECIES } from './fish.js';
import { nextPrice } from './economy-rules.js';
import { testnetWallet, walletAccount, functionCallAction } from './wallet.js';
// ponytail: 0.009 NEAR covers measured seller storage plus callback reserve; re-measure before supporting larger token sets.
const SELLER_STORAGE='9000000000000000000000';
// Separate online session; never import local save balances or inventory.
export class OnlineGame {
  constructor({hub,progression,hud,fishSystem,camera,environment}) {
    Object.assign(this,{hub,progression,hud,fishSystem,camera,environment});
    this.base=document.querySelector('meta[name="deepfish-api"]')?.content||'http://127.0.0.1:3000';
    this.token=sessionStorage.getItem('dsh.online.token');this.active=false;this.busy=false;this.error='';this.pending=[];
    hub.online=this;
    const render=hub.render.bind(hub);this.offlineRender=()=>{render();document.getElementById('hub-account').textContent=this.walletId||'';document.getElementById('hub-wallet').textContent=this.walletId?'DISCONNECT WALLET':'CONNECT WALLET';};hub.render=()=>{if(this.active||['online','chain'].includes(hub.tab))this.render();else this.offlineRender();};
    window.addEventListener('dsh-wallet-change',()=>{this.autoSync();if(hub.open)hub.render();});
    hub.body.addEventListener('click',e=>{const b=e.target.closest('[data-online]');if(b)this.action(b.dataset.online,b.dataset.id).catch(error=>this.showError(error));});
    const canCatch=fishSystem.canCatch;fishSystem.canCatch=spec=>!this.active?canCatch?.(spec)!==false:true;
    this.restoreWalletCallback().catch(error=>this.showError(error));
    // Redirect wallets (Meteor/MyNearWallet) return here with ?transactionHashes=...; keep the hash for the Explorer link.
    const q=new URLSearchParams(location.search),hash=q.get('transactionHashes')?.split(',').pop();
    if(hash||q.has('errorCode')){const failed=q.has('errorCode');this.onchain={lastTx:hash&&{method:'wallet redirect',hash,ok:!failed}};if(failed)this.error=`Wallet: ${q.get('errorMessage')||q.get('errorCode')}`;history.replaceState(null,'',location.pathname+location.hash);if(hash)this.verifyMerchantTx(hash).catch(error=>this.showError(error));}
  }
  async api(path,{method='GET',body,key}={}) {
    const response=await fetch(this.base+path,{method,headers:{...(this.token&&{authorization:`Bearer ${this.token}`}),...(body!==undefined&&{'content-type':'application/json'}),...(key&&{'idempotency-key':key})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(path.startsWith('/api/merchant-chain/')?30000:12000)});
    const result=response.status===204?null:await response.json();if(!response.ok)throw new Error(result?.error||`HTTP ${response.status}`);return result;
  }
  post(path,body={}) {return this.api(path,{method:'POST',body,key:crypto.randomUUID()});}
  async connect(){
    if(!this.token){const s=await this.post('/api/sessions/guest');this.token=s.token;sessionStorage.setItem('dsh.online.token',this.token);}
    try{await this.api('/api/sessions/me');}catch(error){if(error.message==='authentication_required'){this.token=null;sessionStorage.removeItem('dsh.online.token');}throw error;}
    this.pending=JSON.parse(sessionStorage.getItem(`dsh.online.pending.${this.token}`)||'[]');
    await this.flush();await this.refresh();await this.newHunt();
    this.walletId=null;
    walletAccount().then(id=>{this.walletId=id;window.dispatchEvent(new Event('dsh-wallet-change'));}).catch(()=>{});
    if(!this.active){this.offlineData=this.progression.data;this.offlineSave=this.progression.save;this.progression.data=new Progression({offline:false}).data;this.progression.save=()=>{};this.active=true;this.hub.onRefill?.();}
    window.dispatchEvent(new Event('dsh-session-change'));
  }
  async newHunt(){this.hunt=await this.post('/api/hunts',{habitatId:'coral'});}
  // Hunts expire server-side (CATCH_SESSION_TTL_SECONDS); renew in background so shots keep landing.
  huntLive(){const live=this.hunt&&Date.parse(this.hunt.expiresAt)>Date.now()+2000;if(!live&&!this.renewing)this.renewing=this.newHunt().catch(error=>this.showError(error)).finally(()=>{this.renewing=null;});return !!live;}
  async refresh(){
    const [profile,inventory,market,orders,missions,zones,populations,transactions,purchases]=await Promise.all(['/api/player','/api/player/inventory','/api/market','/api/market/orders','/api/player/missions','/api/player/zones','/api/populations','/api/market/transactions','/api/market/purchases'].map(path=>this.api(path)));
    this.canSubmitSpecies=new Set(FISH_SPECIES.map(spec=>spec.id));
    Object.assign(this,{profile,inventory,market,orders,missions,zones,populations,transactions,purchases});this.error='';if(this.hub.open)this.render();
  }
  offline(){
    if(this.flushing||this.pending.length)throw new Error('Sync pending catches before changing mode');
    if(this.active){this.progression.data=this.offlineData;this.progression.save=this.offlineSave;}
    this.active=false;this.hunt=null;this.hub.tab='market';this.hub.onRefill?.();this.hub.render();
  }
  async capture(spec){
    if(!this.active)return;
    if(!this.canSubmitSpecies?.has(spec.id)){this.hud.notify('FISH SPECIES NOT AVAILABLE IN DEMO ECONOMY');return;}
    if(!this.hunt)await this.newHunt();
    if(!this.hunt)throw new Error('Hunt session unavailable');
    const event={huntId:this.hunt.id,shotId:crypto.randomUUID(),speciesId:spec.id,key:crypto.randomUUID()};
    this.pending.push(event);this.savePending();await this.flush();
  }
  savePending(){sessionStorage.setItem(`dsh.online.pending.${this.token}`,JSON.stringify(this.pending));}
  async flush(){
    if(this.flushing)return;this.flushing=true;
    try {while(this.pending.length){const event=this.pending[0];try {
      await this.api(`/api/hunts/${event.huntId}/shots`,{method:'POST',body:{shotId:event.shotId,speciesId:event.speciesId},key:event.key});
      this.pending.shift();this.savePending();this.hud.notify(`CAUGHT ${FISH_SPECIES.find(spec=>spec.id===event.speciesId)?.name||event.speciesId}`);
    }catch(error){if(['idempotency_replay','duplicate_shot'].includes(error.message)){this.pending.shift();this.savePending();continue;}
      if(['hunt_expired','shot_limit_reached','equipment_insufficient','population_depleted','species_unavailable','authentication_required'].includes(error.message)){this.pending.shift();this.savePending();this.hunt=null;}
      throw error;
    }}await this.refresh();}finally{this.flushing=false;}
  }
  conservation(activity,name){
    if(!this.active||this.environment.zoneAt(this.camera.position.x,this.camera.position.z).id!=='coral')return;
    const lower=name.toLowerCase();const subjectId=activity==='release'?'turtle-net-coral':lower.includes('turtle')?'turtle-coral':lower.includes('manta')?'manta-coral':null;
    if(subjectId)this.post('/api/conservation/events',{subjectId,activity}).then(()=>this.refresh()).catch(error=>this.showError(error));
  }
  showError(error){this.error=error.message==='Failed to fetch'?'Network unavailable. Offline save unchanged. Retry online sync.':error.message;this.hud.notify(this.error);if(this.hub.open)this.render();}
  wallet(){return testnetWallet();}
  async restoreWalletCallback(){
    const params=new URLSearchParams(location.hash.slice(1));
    const saved=sessionStorage.getItem('dsh.wallet.challenge');
    if(!saved||!params.has('signature'))return;
    const challenge=JSON.parse(saved);history.replaceState(null,'',location.pathname+location.search);
    if(params.get('state')!==challenge.id)throw new Error('Wallet callback state mismatch');
    await this.api('/api/wallet/verify',{method:'POST',body:{challengeId:challenge.id,accountId:params.get('accountId'),publicKey:params.get('publicKey'),signature:params.get('signature')}});
    sessionStorage.removeItem('dsh.wallet.challenge');await this.connect();
  }
  async action(action,id){
    if(this.busy)return;this.busy=true;this.notice='';this.error='';this.render();
    try{
      if(action==='connect')await this.connect();
      if(action==='offline')this.offline();
      if(action==='logout'){if(this.pending.length||this.flushing)throw new Error('Sync pending catches before logout');await this.api('/api/sessions/current',{method:'DELETE'});this.token=null;sessionStorage.removeItem('dsh.online.token');this.offline();window.dispatchEvent(new Event('dsh-session-change'));}
      if(action==='refresh'){await this.flush();await this.refresh();}
      if(action==='hunt'){await this.newHunt();this.hud.notify('HUNT READY · CORAL FISH');}
      if(action==='sell'){const q=await this.api(`/api/market/quotes?receiptId=${id}`);const sold=await this.post('/api/market/sell',{quoteId:q.id});await this.refresh();this.notice=`SOLD · +${sold.amount} CR`;this.hud.notify(this.notice);}
      if(action==='upgrade'){await this.post('/api/player/equipment/upgrade');await this.refresh();await this.newHunt();}
      if(action==='claim'){await this.post(`/api/player/missions/${id}/claim`);await this.refresh();}
      if(action==='unlock'){await this.post('/api/player/zones/unlock',{zoneId:id});await this.refresh();}
      if(action==='refill'){this.hub.oxygen.refill();this.hub.onRefill?.();}
      if(action==='coral'){this.hub.onDive?.({id:'reef',name:'Coral Garden',pos:[48,26,-42]});this.hub.close();}
      if(action==='dive'){const zone=ZONES.find(z=>z.id===id);if(!zone||!this.zones.some(z=>z.id===id&&z.unlocked))throw new Error('Zone locked');this.hub.onDive?.(zone);this.hub.close();}
      if(action==='wallet'){
        const config=await this.api('/api/near/config');if(!config.merchantEnabled||!config.merchantContractId||config.network!=='testnet')throw new Error('Testnet merchant contract not configured');
        const wallet=await this.wallet();
        if(!await walletAccount())await wallet.signIn({contractId:config.merchantContractId});
        this.walletId=await walletAccount();if(!this.walletId)throw new Error('Testnet wallet account not connected');
        window.dispatchEvent(new Event('dsh-wallet-change'));
      }
      if(action==='verify'){
        const wallet=await this.wallet();this.walletId=await walletAccount();if(!this.walletId)throw new Error('Connect Testnet wallet first');
        const challenge=await this.post('/api/wallet/challenge');sessionStorage.setItem('dsh.wallet.challenge',JSON.stringify(challenge));
        const {Buffer}=await import('https://esm.sh/buffer@6.0.3');
        const signed=await wallet.signMessage({message:challenge.message,recipient:challenge.recipient,nonce:Buffer.from(challenge.nonce,'base64'),callbackUrl:challenge.callbackUrl,state:challenge.id});
        if(signed){if(signed.accountId!==this.walletId)throw new Error('Wallet account changed during verification');await this.post('/api/wallet/verify',{challengeId:challenge.id,accountId:signed.accountId,publicKey:signed.publicKey,signature:signed.signature});sessionStorage.removeItem('dsh.wallet.challenge');await this.refresh();window.dispatchEvent(new Event('dsh-session-change'));}
      }
      if(action==='disconnect'){await (await this.wallet()).signOut();this.walletId=null;window.dispatchEvent(new Event('dsh-wallet-change'));this.hud.notify('WALLET DISCONNECTED · SERVER BINDING RETAINED');}
      if(action==='collectibles'){location.href='collectibles.html';}
      if(action==='shop-refresh'){this.hud.notify('SYNCING NEAR TESTNET…');await this.shopLoad();if(this.onchain.error)throw new Error(this.onchain.error);if(this.onchain.lastTx?.hash)await this.verifyMerchantTx(this.onchain.lastTx.hash);this.hud.notify('NEAR TESTNET SYNCED');}
      if(action==='shop-verify'){if(!this.onchain?.lastTx?.hash)throw new Error('No transaction to verify');await this.verifyMerchantTx(this.onchain.lastTx.hash);await this.shopLoad();}
      if(action==='shop-storage'){await this.shopLoad();if(this.onchain.error)throw new Error(this.onchain.error);const gap=BigInt(SELLER_STORAGE)-BigInt(this.onchain.storage?.total||0);if(gap<=0n)throw new Error('Storage deposit already sufficient');await this.shopCall('storage_deposit',{},gap.toString());}
      if(action==='shop-mint')throw new Error('Mint disabled until online catch receipts can authorize minting.');
      if(action==='shop-sell'){await this.shopLoad();if(this.onchain.error)throw new Error(this.onchain.error);const t=this.onchain.tokens.find(x=>x.tokenId===id);if(!t?.order)throw new Error('No merchant order for this fish');await this.shopCall('accept_purchase_order',{order_id:t.order.id,amount:'1'});}
      if(action==='shop-withdraw'){await this.shopLoad();if(this.onchain.error)throw new Error(this.onchain.error);if(BigInt(this.onchain.sellerClaim||0)<=0n)throw new Error('No on-chain proceeds to withdraw');await this.shopCall('withdraw_proceeds',{});}
    }catch(error){this.showError(error);return false;}finally{this.busy=false;this.render();}
    return true;
  }
  // Wallet connected = chain state loads by itself; no manual SYNC needed.
  autoSync(){
    if(!this.walletId||this.chainLoading)return;
    this.chainLoading=walletAccount().then(id=>{this.walletId=id;return id&&this.shopLoad();}).finally(()=>{this.chainLoading=null;if(this.hub.open)this.render();});
  }
  async shopLoad(){
    this.onchain={...this.onchain,error:''};
    try{this.walletId=await walletAccount();if(!this.walletId)throw new Error('Connect Testnet wallet first');Object.assign(this.onchain,await this.api(`/api/merchant-chain/state/${this.walletId}`));}
    catch(error){this.onchain.error=error.message;}
  }
  async verifyMerchantTx(hash){
    const result=await this.api(`/api/merchant-chain/transactions/${encodeURIComponent(hash)}?accountId=${encodeURIComponent(this.walletId||await walletAccount())}`);
    if(this.onchain.lastTx?.hash===hash)this.onchain.lastTx={...this.onchain.lastTx,...result};
    if(result.status==='pending')this.notice=`${result.method} · PENDING FINALITY · ${hash.slice(0,10)}…`;
    if(result.status==='final')this.notice=`${result.method} · FINAL · ${hash.slice(0,10)}…`;
    if(result.status==='failed')this.error=`${result.method} · FAILED FINAL · ${JSON.stringify(result.error).slice(0,180)}`;
    return result;
  }
  async shopCall(methodName,args,deposit='1'){
    const c=this.onchain;if(!c?.contractId||!this.walletId)throw new Error('Sync on-chain first');
    const wallet=await this.wallet();
    const result=await wallet.signAndSendTransaction({receiverId:c.contractId,actions:[functionCallAction(methodName,args,deposit)]});
    // Redirect wallets return by URL; popup wallets return an outcome object.
    const hash=result?.transaction?.hash||result?.transaction_outcome?.id||new URLSearchParams(location.search).get('transactionHashes')?.split(',').pop();
    if(!hash)throw new Error('Wallet returned no transaction hash; inspect wallet history before retrying');
    c.lastTx={method:methodName,hash,status:'pending'};this.onchain=c;this.render();
    const verification=await this.verifyMerchantTx(hash);if(verification.status==='failed')throw new Error(`${methodName} failed final on-chain: ${JSON.stringify(verification.error).slice(0,200)}`);
    await this.shopLoad();if(this.onchain.error)throw new Error(this.onchain.error);this.notice=`${methodName} · ${verification.status==='final'?'FINAL':'PENDING FINALITY'} · ${hash.slice(0,10)}…`;this.hud.notify(this.notice);
  }
  render(){
    if(this.hub.tab==='chain'&&this.walletId&&!this.onchain?.contractId&&!this.onchain?.error)this.autoSync();
    if(!this.active&&this.hub.tab!=='chain'){this.offlineRender();return;}
    const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const button=(action,label,id='')=>`<button class="hub-btn" data-online="${action}" data-id="${esc(id)}" ${this.busy?'disabled':''}>${esc(label)}</button>`;
    const icon=id=>{const spec=FISH_SPECIES.find(s=>s.id===id);return `<span class="fish-mark" style="--fish:${spec?`#${spec.color.toString(16).padStart(6,'0')}`:'#55aeba'};--fin:${spec?`#${spec.fin.toString(16).padStart(6,'0')}`:'#275770'}" aria-hidden="true"></span>`;};
    const orders=this.orders||[], receipts=(this.inventory?.receipts||[]).filter(r=>r.status==='valid'&&!r.sold_at), merchant=this.market?.merchant?.[0];
    const orderFor=id=>orders.find(o=>o.species_id===id), available=id=>receipts.filter(r=>r.species_id===id);
    const offer=o=>o?.status==='open'&&Number(o.quantity)>0;
    const reasoning=o=>o.price_reason||nextPrice({basePrice:Number(o.base_price||20),marketStock:Number(o.stock||0),targetStock:Number(o.desired_quantity||20),demand:Number(o.needed||0),population:Number(o.population_count||0),capacity:Number(o.capacity||100),previousPrice:Number(o.unit_price||o.base_price||20)}).reason;
    const orderRows=orders.length?orders.map(o=>{const owned=available(o.species_id), remaining=Number(o.quantity), need=Number(o.needed), progress=Number(o.stock)/Math.max(1,Number(o.desired_quantity));return `<div class="market-row ${o.status==='fulfilled'?'is-complete':need<=2&&o.status==='open'?'is-near':''}" title="Merchant price reasoning: ${esc(reasoning(o))}">${icon(o.species_id)}<div class="market-species"><b>${esc(o.name)}</b><small>${esc(o.stock)} / ${esc(o.desired_quantity)} stocked · ${esc(need)} needed · <abbr title="${esc(reasoning(o))}">WHY THIS PRICE?</abbr></small><span class="market-progress" role="progressbar" aria-label="${esc(o.name)} stock" aria-valuenow="${esc(o.stock)}" aria-valuemin="0" aria-valuemax="${esc(o.desired_quantity)}"><i style="width:${Math.min(100,Math.max(0,progress*100))}%"></i></span></div><div class="market-price"><b>${offer(o)?`${esc(o.unit_price)} CR`:'—'}</b><small>${offer(o)?`${esc(remaining)} left · up to ${esc(remaining*Number(o.unit_price))} CR`:esc(o.status)}</small></div>${offer(o)&&owned.length?button('sell','SELL',owned[0].id):`<span class="order-state">${o.status==='fulfilled'?'COMPLETE':offer(o)?'NO CATCH':esc(o.status).toUpperCase()}</span>`}</div>`;}).join(''):'<p class="market-empty">No orders available. Sync to check merchant demand.</p>';
    const held=new Map();for(const r of receipts){const group=held.get(r.species_id)||[];group.push(r);held.set(r.species_id,group);}
    const inventoryRows=held.size?[...held].map(([id,group])=>{const o=orderFor(id), active=offer(o), price=active?Number(o.unit_price):0;return `<div class="market-row">${icon(id)}<div class="market-species"><b>${esc(o?.name||id)}</b><small>${group.length} available · ${active?`${esc(o.quantity)} requested`:'No active order'}</small></div><div class="market-price"><b>${active?`${esc(price)} CR`:'—'}</b><small>${active?`up to ${esc(Math.min(group.length,Number(o.quantity))*price)} CR`:'No offer'}</small></div>${active?button('sell','SELL',group[0].id):'<span class="order-state">WAITING</span>'}</div>`;}).join(''):'<p class="market-empty">Hold empty. Catch fish in Coral, then sync your haul.</p>';
    const history=(this.transactions||[]).slice(0,20).map(t=>`<div class="history-row"><span>${esc(t.kind==='fish_sale'?FISH_SPECIES.find(s=>s.id===this.inventory?.receipts?.find(r=>r.id===t.reference_id)?.species_id)?.name||'Fish sale':t.kind.replaceAll('_',' '))}<small>${esc(new Date(t.created_at).toLocaleString())} · ${esc(t.status)} · ${t.kind==='fish_sale'?'1 fish':'transaction'}</small></span><b>${['fish_sale','mission_reward'].includes(t.kind)?'+':'-'}${esc(t.amount)} CR</b></div>`).join('')||'<p class="market-empty">No transactions yet.</p>';
    for(const tab of this.hub.root.querySelectorAll('[data-tab]'))tab.classList.toggle('active',tab.dataset.tab===this.hub.tab);
    this.hub.cashEl.textContent=`${this.active?this.profile?.balance??0:this.progression.cash} CR`;
    document.getElementById('hub-mode').textContent=this.active?(this.profile?.wallet_account?'WALLET VERIFIED':'ONLINE GUEST'):'OFFLINE GUEST';
    document.getElementById('hub-account').textContent=this.walletId||'';
    document.getElementById('hub-scope').textContent=this.active?'ONLINE CREDITS · OFF-CHAIN':'OFFLINE SAVE';
    document.getElementById('hub-wallet').textContent=this.walletId?'DISCONNECT WALLET':'CONNECT WALLET';
    let html=`<div class="market-feedback ${this.error?'is-error':this.notice?'is-success':''}" role="status">${this.busy?'Loading market…':esc(this.error||this.notice||'')}</div>`;
    if(this.hub.tab==='chain'&&!this.walletId){html+=`<div class="market-intro"><h3>NEAR Testnet</h3><p>Connect wallet to view and use on-chain merchant.</p>${button('wallet','CONNECT WALLET')}</div>`;this.hub.body.innerHTML=html;return;}
    if(!this.active&&this.hub.tab!=='chain'){html+=`<div class="market-intro"><h3>Dock Merchant</h3><p>Online orders and credits use a separate Guest session. Offline catch stays in your saved game.</p>${button('connect','PLAY ONLINE GUEST')}</div>`;this.hub.body.innerHTML=html;return;}
    if(this.hub.tab==='economy'){
      html+='<h3>Economy loop</h3><p>BACKEND OFF-CHAIN: dive Coral, catch supported fish, sync, review orders, sell chosen fish. Merchant stock rises and treasury falls; next market tick recalculates prices and orders. Use unmet demand to plan the next dive.</p><p>NEAR TESTNET MERCHANT: wallet actions available in NEAR tab. Catches are not minted on-chain; Testnet assets are separate from CR and PostgreSQL economy. Transaction finality is checked against Testnet RPC.</p>';
      html+=`<p>Backend merchant treasury: ${esc(merchant?.available_balance??'Unavailable')} CR · player balance: ${esc(this.profile?.balance??'Unavailable')} CR</p><h3>Merchant inventory and active orders · OFF-CHAIN</h3>${orderRows}<h3>Your fish · OFF-CHAIN</h3>${inventoryRows}<h3>Backend settlement history · not blockchain transactions</h3>${history}`;
    }else if(this.hub.tab==='online'){
      html+=`<div class="merchant-head"><span class="merchant-portrait" aria-hidden="true"></span><div><small>MARKET OVERVIEW</small><h3>Dock Merchant</h3></div><span class="merchant-status ${merchant?.enabled?'':'is-paused'}">${merchant?.enabled?'BUYING':'PAUSED'}</span></div>`;
      html+=`<div class="market-metrics"><div><small>MERCHANT TREASURY</small><strong class="${Number(merchant?.available_balance)-Number(merchant?.reserve_floor)<=Number(merchant?.max_tick)?'is-low':''}">${esc(merchant?.available_balance??0)} <em>CR</em></strong></div><div><small>ACTIVE ORDERS</small><strong>${orders.filter(offer).length}</strong></div><div><small>FISH NEEDED</small><strong>${orders.reduce((n,o)=>n+Number(o.needed),0)}</strong></div><div><small>PURCHASES</small><strong>${(this.purchases||[]).length}<em> recent</em></strong></div></div>`;
      html+=`<div class="market-section-title"><h3>Current orders / fish requirements</h3>${button('refresh',`SYNC (${this.pending.length} pending)`)}</div><div class="market-list">${orderRows}</div><div class="hub-quick">${button('coral','DIVE CORAL')}${button('hunt','NEW HUNT')}${button('offline','OFFLINE MODE')}${button('logout','LOG OUT')}</div>`;
    }else if(this.hub.tab==='market'){
      html+=`<div class="merchant-head"><span class="merchant-portrait" aria-hidden="true"></span><div><small>FISH MARKET / OFF-CHAIN</small><h3>Dock Merchant</h3></div><span class="merchant-status ${merchant?.enabled?'':'is-paused'}">${merchant?.enabled?'BUYING':'PAUSED'}</span></div>`;
      html+=`<div class="market-metrics"><div><small>YOUR BALANCE</small><strong>${esc(this.profile?.balance??0)} <em>CR</em></strong></div><div><small>MERCHANT TREASURY</small><strong class="${Number(merchant?.available_balance)-Number(merchant?.reserve_floor)<=Number(merchant?.max_tick)?'is-low':''}">${esc(merchant?.available_balance??0)} <em>CR</em></strong></div><div><small>ACTIVE ORDERS</small><strong>${orders.filter(offer).length}</strong></div><div><small>IN HOLD</small><strong>${receipts.length}</strong></div></div>`;
      html+=`<div class="market-columns"><section><div class="market-section-title"><h3>Current orders / fish requirements</h3>${button('refresh',`SYNC (${this.pending.length} pending)`)}</div><div class="market-list">${orderRows}</div></section><section><div class="market-section-title"><h3>Your inventory</h3></div><div class="market-list">${inventoryRows}</div></section></div>`;
      html+=`<div class="market-history"><h3>Your transaction history</h3>${history}<details><summary>Merchant purchase history</summary>${(this.purchases||[]).map(t=>`<div class="history-row"><span>${esc(t.name)}<small>${esc(new Date(t.created_at).toLocaleString())} · completed</small></span><b>+${esc(t.unit_price)} CR</b></div>`).join('')||'<p class="market-empty">No purchases yet.</p>'}</details></div>`;
    }else if(this.hub.tab==='equipment')html+=`<h3>GEAR</h3><div class="hub-quick">${button('refill','REFILL OXYGEN')}${button('upgrade','UPGRADE SPEARGUN')}</div><p>Speargun Lv ${esc(this.profile?.speargun_level||1)} · oxygen and upgrades use game credits.</p>`;
    else if(this.hub.tab==='missions')html+=`<h3>Missions</h3>${(this.missions||[]).map(m=>`<div class="hub-row"><div><b>${esc(m.name)}</b><small>${esc(m.progress)}/${esc(m.goal)} · ${esc(m.reward)} CR</small></div>${m.claimed?'<span class="hub-tag">PAID</span>':button('claim','CLAIM',m.id)}</div>`).join('')||'<p class="market-empty">No missions available.</p>'}`;
    else if(this.hub.tab==='records')html+=`<h3>Habitat population</h3>${(this.populations||[]).map(p=>`<div class="hub-row"><span>${esc(p.species_id)}</span><b>${esc(p.population_count)}/${esc(p.capacity)}</b></div>`).join('')}`;
    else if(this.hub.tab==='storage')html+=`<h3>Catch hold</h3><div class="market-list">${inventoryRows}</div>`;
    else if(this.hub.tab==='chain'){
      const c=this.onchain||{},near=v=>{const n=BigInt(v||0);return `${n/10n**24n}.${(n%10n**24n).toString().padStart(24,'0').slice(0,5)}`;};
      const tx=c.lastTx,link=h=>`<a href="https://testnet.nearblocks.io/txns/${esc(h)}" target="_blank" rel="noopener noreferrer">${esc(h)}</a>`;
      html+='<h3>NEAR Testnet merchant · native NEAR</h3>';
      if(!c.contractId)html+=`<p class="market-empty">${esc(c.error||'Loading NEAR Testnet state…')}</p>${c.error?button('shop-refresh','RETRY'):''}`;
      else{
        const lowStorage=BigInt(c.storage?.total||0)<BigInt(SELLER_STORAGE);
        html+=`<p><small>CONTRACT</small> ${esc(c.contractId)} · <small>ACCOUNT</small> ${esc(c.accountId)}</p>`;
        html+=`<p class="hub-note">Catch mints by server (no popup). Selling to merchant needs your signature. 1 CR = 0.0005 NEAR; CR price stays dynamic.</p>${c.merchantBroke?'<p class="market-feedback is-error">MERCHANT BROKE · treasury empty, no new on-chain orders until owner invests.</p>':c.agent?`<p class="hub-note">Merchant treasury ${near(c.agent.availableTreasury)} NEAR</p>`:''}`;
        html+=`<div class="market-metrics"><div><small>FISH TOKENS</small><strong>${c.tokens.length}</strong></div><div><small>SALE PROCEEDS</small><strong>${near(c.sellerClaim)} <em>NEAR</em></strong></div><div><small>STORAGE DEPOSIT</small><strong>${near(c.storage?.total)} <em>NEAR</em></strong></div></div>`;
        html+=c.tokens.map(t=>`<div class="market-row"><div class="market-species"><b>${esc(t.title)}</b><small>${esc(t.tokenId)}</small></div><div class="market-price"><b>${t.order?`${near(t.order.unitPrice)} NEAR`:'—'}</b><small>${t.order?'merchant order':'no order'}</small></div>${t.order&&!lowStorage?button('shop-sell','SELL',t.tokenId):`<span class="order-state">${t.order?'NEED STORAGE':'WAITING'}</span>`}</div>`).join('')||'<p class="market-empty">No fish tokens on this account.</p>';
        html+=`<div class="hub-quick">${button('shop-refresh','SYNC ON-CHAIN')}${lowStorage?button('shop-storage',`STORAGE DEPOSIT ${near(BigInt(SELLER_STORAGE)-BigInt(c.storage?.total||0))} NEAR`):''}${lowStorage?'':!this.active?'<p class="hub-note">Play online to auto-mint catches to this wallet.</p>':!this.profile?.wallet_account?button('verify','VERIFY WALLET · ENABLE AUTO-MINT'):'<p class="hub-note">Auto-mint on: each validated catch mints to this wallet, no popup.</p>'}${c.sellerClaim!=='0'?button('shop-withdraw','WITHDRAW NEAR'):''}</div>`;
      }
      if(tx)html+=`<p class="hub-note">LAST TX · ${esc(tx.method)} · ${tx.status==='final'?'FINAL':tx.status==='failed'?'FAILED FINAL':tx.status==='pending'?'PENDING FINALITY':tx.ok?'SUBMITTED · FINALITY UNVERIFIED':'WALLET REPORTED FAILURE'} · ${link(tx.hash)}</p>${tx.status!=='final'&&tx.status!=='failed'?button('shop-verify','VERIFY LAST TX'):''}`;
      if(c.contractId&&c.error)html+=`<p class="market-feedback is-error">${esc(c.error)}</p>`;
    }
    html+='<p class="hub-note">Backend sales: player credits rise, merchant treasury falls, stock rises and demand falls. Prices update on the next market tick. Catch another requested species when an order fills. Online credits and offline save stay separate; neither is NEAR Testnet state.</p>';
    this.hub.body.innerHTML=html;
  }
}
