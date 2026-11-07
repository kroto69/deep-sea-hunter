import { FISH_PRICES, ZONES, UPGRADES, MISSIONS } from './progression.js';
import { simulateSevenDays } from './fast-forward.js';

// Boat stations reuse saved progression; no new economy state.
export class Hub {
  constructor({ progression, hud, audio, oxygen, onDive, onRefill }) {
    Object.assign(this, { progression, hud, audio, oxygen, onDive, onRefill });
    this.root = document.getElementById('hub');
    this.body = document.getElementById('hub-body');
    this.tabs = document.getElementById('hub-tabs');
    this.cashEl = document.getElementById('hub-cash');
    this.open = false;
    this.tab = 'market';
    this.root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      this.tab = btn.dataset.tab;
      this.render();
    });
    document.getElementById('hub-close').addEventListener('click', () => this.close());
    document.getElementById('hub-wallet').addEventListener('click', () => this.online?.walletLogin?.open());
    this.body.addEventListener('click', (e) => this._onAction(e));
    this.body.addEventListener('click', e => { if (e.target.closest('[data-action="tutorial"]')) window.dispatchEvent(new Event('dsh-tutorial-open')); });
    this.body.addEventListener('click', e => { if (e.target.closest('[data-action="fast-forward"]')) this.fastForward(); });
    this.root.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const buttons = [...this.root.querySelectorAll('button:not(:disabled):not(.hidden)')];
      const index = buttons.indexOf(document.activeElement);
      e.preventDefault();
      buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    });
  }

  show() {
    this.open = true;
    this.previousFocus = document.activeElement;
    this.root.classList.remove('hidden');
    this.render();
    document.getElementById('hub-close').focus();
  }

  close() {
    this.open = false;
    this.root.classList.add('hidden');
    this.previousFocus?.focus();
  }

  _onAction(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, id } = el.dataset;
    const p = this.progression;
    if (action === 'refill') {
      this.oxygen.refill();
      this.onRefill?.();
      this.audio.refill();
    } else if (action === 'sell') {
      const total = p.sellAll();
      if (total > 0) { this.audio.coin(); this.hud.notify(`SOLD · +${total} CREDITS`); }
      else this.hud.notify('NO FISH TO SELL');
    } else if (action === 'sell-qty') {
      const input = this.body.querySelector(`[data-qty-for="${id}"]`);
      const result = p.sellSpecies(id, Number(input?.value));
      if (result.qty > 0) { this.audio.coin(); this.hud.notify(`SOLD ${result.qty} × ${id.toUpperCase()} · +${result.total} CR`); }
      else this.hud.notify('NOTHING TO SELL');
    } else if (action === 'upgrade') {
      if (p.buyUpgrade(id)) {
        this.audio.unlockSound();
        this.hud.notify(`UPGRADED · ${UPGRADES.find(u => u.id === id).name.toUpperCase()}`);
        this.onRefill?.();
      } else this.hud.notify('NOT ENOUGH CREDITS');
    } else if (action === 'claim') {
      const reward = p.claimMission(id);
      if (reward) { this.audio.coin(); this.hud.notify(`MISSION PAID · +${reward} CREDITS`); }
    } else if (action === 'unlock') {
      if (p.unlockZone(id)) {
        this.audio.unlockSound();
        this.hud.notify(`ZONE UNLOCKED · ${ZONES.find(z => z.id === id).name.toUpperCase()}`);
      } else this.hud.notify('NOT ENOUGH CREDITS');
    } else if (action === 'collectibles') {
      location.href = 'collectibles.html';
      return;
    } else if (action === 'dive') {
      if (!p.data.zones.includes(id)) return;
      this.onDive?.(ZONES.find(z => z.id === id));
      this.close();
      return;
    }
    this.audio.ui();
    this.render();
  }

  render() {
    const p = this.progression;
    this.cashEl.textContent = `${p.cash} CR`;
    document.getElementById('hub-mode').textContent = 'OFFLINE GUEST';
    document.getElementById('hub-account').textContent = '';
    document.getElementById('hub-scope').textContent = 'OFFLINE SAVE';
    document.getElementById('hub-wallet').textContent = 'CONNECT WALLET';
    for (const btn of this.root.querySelectorAll('[data-tab]')) {
      btn.classList.toggle('active', btn.dataset.tab === this.tab);
    }
    const inv = p.data.inventory;
    const invCount = Object.values(inv).reduce((a, b) => a + b, 0);
    let html = '';
    if (this.tab === 'economy') {
      html += '<div class="hub-station"><span>ON-CHAIN ECONOMY · NEAR TESTNET</span><b>DISABLED</b></div>';
      html += '<p class="hub-note">No verified merchant contract configured. Treasury, asset balances, prices and confirmed purchases unavailable. Offline fish and credits are not blockchain assets.</p>';
      html += '<div class="hub-row"><b>Merchant treasury / inventory</b><span>Unavailable</span></div><div class="hub-row"><b>Your NEP-245 assets</b><span>Connect feature unavailable</span></div><div class="hub-row"><b>Confirmed transactions</b><span>None verified</span></div>';
    } else if (this.tab === 'market') {
      const rows = Object.entries(inv).filter(([, n]) => n > 0);
      const total = Math.round(rows.reduce((s, [id, n]) => s + (FISH_PRICES[id] || 20) * n, 0) * (1 + p.upgradeLevel('sales') * 0.15));
      html += `<div class="hub-station"><span>FISH MARKET</span><b>${p.cash} CR</b></div>`;
      html += `<p class="hub-note">Your catch, held on the boat. Sell fish here for CR — choose how many of each species to sell, or sell the whole hold at once.</p>`;
      html += rows.length ? rows.map(([id, n]) => `<div class="hub-row"><div><b>${id.toUpperCase()}</b><br><span class="hub-dim">${n} in hold · ${FISH_PRICES[id] || 20} CR each</span></div><input class="sell-qty" type="number" min="1" max="${n}" step="1" value="1" data-qty-for="${id}" aria-label="How many ${id} to sell"><button class="hub-btn" data-action="sell-qty" data-id="${id}">SELL</button></div>`).join('') : '<div class="hub-note">Hold empty. Caught fish arrive here.</div>';
      html += `<button class="hub-btn wide" data-action="sell" ${total ? '' : 'disabled'}>SELL CATCH · ${total} CR</button>`;
      html += `<details><summary>Fish price list</summary>${Object.entries(FISH_PRICES).map(([id, price]) => `<div class="hub-row"><span>${id.toUpperCase()}</span><span>${price} CR</span></div>`).join('')}</details>`;
      html += '<p class="hub-note">Offline sale history was not stored in existing save. Online transactions appear under ONLINE / NEAR.</p>';
    } else if (this.tab === 'shops') {
      html += '<div class="hub-station"><span>MOTHERSHIP MARKETPLACE</span><b>PLAYER SHOPS</b></div>';
      html += '<p class="hub-note">Player shops live online: buy a 500 CR boat-stall license once, list your catch at your own price, and buy fish from other divers — all in CR. Listed fish count as market supply, so a full shop board pushes the merchant price down. Play online to use them.</p>';
    } else if (this.tab === 'equipment') {
      html += '<div class="hub-station"><span>EQUIPMENT SHOP</span><b>DECK SUPPLIES</b></div>';
      html += `<button class="hub-btn wide" data-action="refill">REFILL OXYGEN · NO CHARGE</button>`;
      html += '<p class="hub-note">Speargun and dive light start equipped. Loader upgrades reload; ammo refills automatically. No separate ammo purchase in existing economy.</p>';
      for (const u of UPGRADES) {
        const lvl = p.upgradeLevel(u.id);
        const cost = lvl < u.max ? u.cost[lvl] : null;
        html += `<div class="hub-row">
          <div><b>${u.name}</b> <span class="hub-dim">Lv ${lvl}/${u.max}</span><br><span class="hub-dim">${u.desc}</span></div>
          ${cost === null
            ? `<span class="hub-tag">MAX</span>`
            : `<button class="hub-btn" data-action="upgrade" data-id="${u.id}">${cost} CR</button>`}
        </div>`;
      }
    } else if (this.tab === 'storage') {
      const rows = Object.entries(inv).filter(([, n]) => n > 0);
      html += `<p class="hub-note">Everything in your hold, by species. Selling here is the same as selling from FISH — pick a quantity, or sell everything at once.</p>`;
      html += rows.length
        ? rows.map(([id, n]) => `<div class="hub-row"><div>${id.toUpperCase()}</div><div class="hub-dim">${n} × ${FISH_PRICES[id] || 20} CR</div><input class="sell-qty" type="number" min="1" max="${n}" step="1" value="1" data-qty-for="${id}" aria-label="How many ${id} to sell"><button class="hub-btn" data-action="sell-qty" data-id="${id}">SELL</button></div>`).join('')
        : `<div class="hub-note">No fish in storage. Hunt and it lands here automatically.</div>`;
      const total = Math.round(rows.reduce((s, [id, n]) => s + (FISH_PRICES[id] || 20) * n, 0) * (1 + p.upgradeLevel('sales') * 0.15));
      html += `<button class="hub-btn wide" data-action="sell">SELL ALL · ${total} CR</button>`;
      const specimens = Object.keys(p.data.rare);
      html += `<div class="hub-note">Inventory · photos: ${Object.keys(p.data.photos).length} · rare specimens: ${specimens.length ? specimens.join(', ') : 'none'}</div>`;
    } else if (this.tab === 'missions') {
      html += `<p class="hub-note">Jobs pay CR when you hit the goal. Claim the reward once a job is done.</p>`;
      for (const m of MISSIONS) {
        const prog = p.missionProgress(m);
        const claimed = p.data.claimed.includes(m.id);
        html += `<div class="hub-row">
          <div><b>${m.name}</b> <span class="hub-dim">${prog}/${m.goal}</span><br><span class="hub-dim">Reward ${m.reward} CR</span></div>
          ${claimed ? '<span class="hub-tag">PAID</span>'
            : `<button class="hub-btn" data-action="claim" data-id="${m.id}" ${p.missionDone(m) ? '' : 'disabled'}>CLAIM</button>`}
        </div>`;
      }
    } else if (this.tab === 'records') {
      html += `<p class="hub-note">Your catch records, photos, and rare finds from every dive.</p>`;
      const records = Object.entries(p.data.records);
      html += records.length
        ? records.map(([id, r]) => `<div class="hub-row"><div>${id.toUpperCase()}</div><div class="hub-dim">${r.count} caught</div></div>`).join('')
        : `<div class="hub-note">No catch records yet.</div>`;
      const photos = Object.entries(p.data.photos);
      html += photos.length
        ? photos.map(([name, n]) => `<div class="hub-row"><div>PHOTO · ${name.toUpperCase()}</div><div class="hub-dim">${n}×</div></div>`).join('')
        : `<div class="hub-note">No photos taken. Aim at an animal and press [P].</div>`;
      const rare = Object.keys(p.data.rare);
      html += rare.length
        ? `<div class="hub-note">Rare finds: ${rare.join(', ')}</div>`
        : `<div class="hub-note">No rare specimens yet.</div>`;
    }
    if (this.tab === 'market') html += '<button class="hub-btn" data-action="fast-forward">FAST FORWARD · 7 SIMULATED DAYS</button>';
    html += `<div class="hub-note">Fish in storage: ${invCount} · Debris cleaned: ${p.stats.debris} · Animals freed: ${p.stats.freed}</div><button class="hub-btn" data-action="tutorial">HOW TO PLAY</button>`;
    this.body.innerHTML = html;
    if (this.simulation) this.renderSimulation();
  }

  fastForward() {
    clearInterval(this.fastForwardTimer);
    const inv = this.progression.data.inventory;
    const demand = Object.fromEntries(Object.keys(FISH_PRICES).map(id => [id, Math.max(1, Math.round((FISH_PRICES[id] || 20) / 10))]));
    // Simulated treasury is the merchant's (mirrors MERCHANT_INITIAL_TREASURY=10000
    // in the backend seed), not the player's cash: a broke merchant would
    // otherwise make the whole simulated week trade nothing.
    this.simulation = simulateSevenDays({ inventory: inv, treasury: 10000, demand });
    this.simulationDay = 0;
    this.renderSimulation();
    this.fastForwardStarted = Date.now();
    this.fastForwardTimer = setInterval(() => {
      this.simulationDay = Math.min(7, Math.floor((Date.now() - this.fastForwardStarted) / (60_000 / 7)));
      this.renderSimulation();
      if (this.simulationDay === 7) clearInterval(this.fastForwardTimer);
    }, 1000);
  }

  renderSimulation() {
    this.body.querySelector('.hub-simulation')?.remove();
    const day = this.simulationDay || 0;
    const node = document.createElement('section');
    node.className = 'hub-simulation';
    node.setAttribute('aria-live', 'polite');
    node.innerHTML = `<h3>LOCAL SIMULATION · NOT ON-CHAIN</h3><p>7 days / 60 seconds · day ${day}/7 · treasury ${this.simulation.before.treasury} → ${this.simulation.after.treasury} CR${this.simulation.after.merchantClosed ? ' · MERCHANT BANKRUPT (closed)' : ''}</p><ol>${this.simulation.days.slice(0, day).map(d=>`<li><b>Day ${d.day}</b> · treasury ${d.treasury} CR${d.merchantClosed ? ' · SHOP CLOSED' : ''}${d.events.map(e=>e.type==='bankrupt'?`<br>Merchant went bankrupt: treasury ${e.treasuryAfter} CR at/below its ${e.reserveFloor} CR reserve floor — shop closed until someone invests.`:e.type==='invest'?`<br>Investment +${e.amount} CR → treasury ${e.treasuryAfter} CR · ${e.reopened ? 'merchant reopened' : `still closed, needs ${e.neededAfter} CR more`}.`:e.closed?`<br>${e.species}: shop closed (bankrupt) — no trading; price stays ${e.price} CR.`:`<br>${e.species}: supplied ${e.supplied}, bought ${e.bought}; stock ${e.stockBefore}→${e.stockAfter}; demand ${e.demandBefore}→${e.demandAfter}; price ${e.priceBefore}→${e.price} CR · ${e.reason}`).join('')}</li>`).join('')}</ol>`;
    this.body.append(node);
  }
}
