import { FISH_PRICES, ZONES, UPGRADES, MISSIONS } from './progression.js';

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
    if (this.tab === 'market') {
      const rows = Object.entries(inv).filter(([, n]) => n > 0);
      const total = Math.round(rows.reduce((s, [id, n]) => s + (FISH_PRICES[id] || 20) * n, 0) * (1 + p.upgradeLevel('sales') * 0.15));
      html += `<div class="hub-station"><span>FISH MARKET</span><b>${p.cash} CR</b></div>`;
      html += rows.length ? rows.map(([id, n]) => `<div class="hub-row"><div><b>${id.toUpperCase()}</b><br><span class="hub-dim">${n} in hold · ${FISH_PRICES[id] || 20} CR each</span></div><span>${n} fish</span></div>`).join('') : '<div class="hub-note">Hold empty. Caught fish arrive here.</div>';
      html += `<button class="hub-btn wide" data-action="sell" ${total ? '' : 'disabled'}>SELL CATCH · ${total} CR</button>`;
      html += `<details><summary>Fish price list</summary>${Object.entries(FISH_PRICES).map(([id, price]) => `<div class="hub-row"><span>${id.toUpperCase()}</span><span>${price} CR</span></div>`).join('')}</details>`;
      html += '<p class="hub-note">Offline sale history was not stored in existing save. Online transactions appear under ONLINE / NEAR.</p>';
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
    } else if (this.tab === 'workshop') {
      html += '<div class="hub-station"><span>WORKSHOP</span><b>LOADOUT</b></div>';
      html += `<div class="hub-row"><div><b>Speargun · equipped</b><br><span class="hub-dim">Loader Lv ${p.upgradeLevel('reload')}/2 · automatic ammo</span></div></div>`;
      html += `<div class="hub-row"><div><b>Oxygen tank · equipped</b><br><span class="hub-dim">Lv ${p.upgradeLevel('oxygen')}/3 · capacity ${p.oxygenCapacity()}</span></div></div>`;
      html += `<div class="hub-row"><div><b>Dive light · equipped</b><br><span class="hub-dim">Lv ${p.upgradeLevel('light')}/2</span></div></div>`;
      for (const u of UPGRADES.filter(u => u.id !== 'sales')) {
        const lvl = p.upgradeLevel(u.id);
        html += `<div class="hub-row"><div><b>${u.name}</b><br><span class="hub-dim">Lv ${lvl}/${u.max} · ${u.desc}</span></div>${lvl < u.max ? `<button class="hub-btn" data-action="upgrade" data-id="${u.id}">UPGRADE · ${u.cost[lvl]} CR</button>` : '<span class="hub-tag">MAX</span>'}</div>`;
      }
      html += '<p class="hub-note">Single loadout in existing game; no alternative gear to select.</p>';
    } else if (this.tab === 'collectibles') {
      html += '<div class="hub-station"><span>COLLECTIBLES</span><b>TESTNET</b></div><p class="hub-note">NFT collectibles are separate from ordinary fish and credits.</p><button class="hub-btn wide" data-action="collectibles">OPEN COLLECTIBLES</button>';
    } else if (this.tab === 'storage') {
      const rows = Object.entries(inv).filter(([, n]) => n > 0);
      html += rows.length
        ? rows.map(([id, n]) => `<div class="hub-row"><div>${id.toUpperCase()}</div><div class="hub-dim">${n} × ${FISH_PRICES[id] || 20} CR</div></div>`).join('')
        : `<div class="hub-note">No fish in storage. Hunt and it lands here automatically.</div>`;
      const total = rows.reduce((s, [id, n]) => s + (FISH_PRICES[id] || 20) * n, 0);
      html += `<button class="hub-btn wide" data-action="sell">SELL ALL · ${total} CR</button>`;
      const specimens = Object.keys(p.data.rare);
      html += `<div class="hub-note">Inventory · photos: ${Object.keys(p.data.photos).length} · rare specimens: ${specimens.length ? specimens.join(', ') : 'none'}</div>`;
    } else if (this.tab === 'missions') {
      for (const m of MISSIONS) {
        const prog = p.missionProgress(m);
        const claimed = p.data.claimed.includes(m.id);
        html += `<div class="hub-row">
          <div><b>${m.name}</b> <span class="hub-dim">${prog}/${m.goal}</span><br><span class="hub-dim">Reward ${m.reward} CR</span></div>
          ${claimed ? '<span class="hub-tag">PAID</span>'
            : `<button class="hub-btn" data-action="claim" data-id="${m.id}" ${p.missionDone(m) ? '' : 'disabled'}>CLAIM</button>`}
        </div>`;
      }
    } else if (this.tab === 'zones') {
      html += '<div class="hub-station"><span>DIVE PREPARATION</span><b>CHART TABLE</b></div>';
      for (const z of ZONES) {
        const unlocked = p.data.zones.includes(z.id);
        html += `<div class="hub-row">
          <div><b>${z.name}</b><br><span class="hub-dim">${z.cost ? `${z.cost} CR to unlock` : 'Included'} · ${z.id === 'reef' ? 'Shallow reef' : z.id === 'wreck' ? 'Sunken hull' : z.id === 'kelp' ? 'Kelp canopy' : 'Deep water'}</span></div>
          ${unlocked
            ? `<button class="hub-btn" data-action="dive" data-id="${z.id}">DIVE</button>`
            : `<button class="hub-btn" data-action="unlock" data-id="${z.id}">UNLOCK</button>`}
        </div>`;
      }
    } else if (this.tab === 'records') {
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
    html += `<div class="hub-note">Fish in storage: ${invCount} · Debris cleaned: ${p.stats.debris} · Animals freed: ${p.stats.freed}</div><button class="hub-btn" data-action="tutorial">HOW TO PLAY</button>`;
    this.body.innerHTML = html;
  }
}
