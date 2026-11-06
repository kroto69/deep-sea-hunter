// Persistent player progression: cash, records, upgrades, zones, missions.
const KEY = 'dsh.save.v2';

export const FISH_PRICES = {
  clownfish: 18, bluetang: 26, angelfish: 34, butterfly: 22,
  parrotfish: 40, grouper: 65, barracuda: 70, damselfish: 12,
  chromis: 14, wrasse: 28, lionfish: 48, tuna: 55, cardinalfish: 16,
  moorishidol: 32, triggerfish: 38, pufferfish: 42, seahorse: 45, sardine: 10, squid: 50
};

export const ZONES = [
  { id: 'reef', name: 'Sunlit Reef', pos: [0, 24, 20], cost: 0 },
  { id: 'wreck', name: 'Wreck Site', pos: [6, 18, 58], cost: 150 },
  { id: 'kelp', name: 'Kelp Forest', pos: [68, 19, -68], cost: 250 },
  { id: 'trench', name: 'Deep Trench', pos: [68, 12, 68], cost: 400 }
];

export const UPGRADES = [
  { id: 'oxygen', name: 'Oxygen Tank', max: 3, cost: [120, 260, 480], desc: '+25% oxygen capacity' },
  { id: 'reload', name: 'Speargun Loader', max: 2, cost: [180, 380], desc: '-20% reload time' },
  { id: 'light', name: 'Dive Light', max: 2, cost: [100, 240], desc: '+cave beam range' },
  { id: 'sales', name: 'Buyer Contacts', max: 2, cost: [220, 460], desc: '+15% fish sale value' }
];

export const MISSIONS = [
  { id: 'catch5', name: 'Catch 5 fish', stat: 'caught', goal: 5, reward: 80 },
  { id: 'photo2', name: 'Photograph 2 species', stat: 'photos', goal: 2, reward: 90 },
  { id: 'clean3', name: 'Clean 3 debris', stat: 'debris', goal: 3, reward: 60 },
  { id: 'free1', name: 'Free a trapped animal', stat: 'freed', goal: 1, reward: 120 },
  { id: 'rare1', name: 'Find a rare specimen', stat: 'specimens', goal: 1, reward: 150 }
];

export class Progression {
  constructor({offline=true} = {}) {
    const defaults = {
      cash: 0,
      loot: [],
      inventory: {},
      records: {},
      rare: {},
      photos: {},
      upgrades: { oxygen: 0, reload: 0, light: 0, sales: 0 },
      zones: ['reef'],
      zone: 'reef',
      visited: [],
      claimed: [],
      stats: { caught: 0, photos: 0, debris: 0, freed: 0, specimens: 0, dives: 0 },
      tutorialComplete: false
    };
    let saved = null;
    try { if(offline) saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { saved = null; }
    this.data = defaults;
    const count = n => Number.isSafeInteger(n) && n >= 0 && n <= 100000000;
    if (saved && typeof saved === 'object') {
      defaults.tutorialComplete = saved.tutorialComplete === true;
      if (count(saved.cash)) defaults.cash = saved.cash;
      if (Array.isArray(saved.loot)) defaults.loot = [...new Set(saved.loot.filter(id => /^item\d{1,2}$/.test(id)))];
      for (const key of ['inventory', 'records', 'photos', 'rare']) {
        for (const [id, value] of Object.entries(saved[key] || {})) {
          if (!/^[\w -]{1,60}$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id)) continue;
          if (key === 'records' && count(value?.count)) defaults.records[id] = { count: value.count };
          else if (key === 'rare' && value === true) defaults.rare[id] = true;
          else if ((key === 'photos' || key === 'inventory') && count(value)) defaults[key][id] = value;
        }
      }
      for (const u of UPGRADES) {
        const level = saved.upgrades?.[u.id];
        if (count(level) && level <= u.max) defaults.upgrades[u.id] = level;
      }
      for (const key of Object.keys(defaults.stats)) if (count(saved.stats?.[key])) defaults.stats[key] = saved.stats[key];
      for (const key of ['zones', 'visited', 'claimed']) {
        const allowed = key === 'claimed' ? MISSIONS.map(m => m.id) : ZONES.map(z => z.id);
        if (Array.isArray(saved[key])) defaults[key] = [...new Set(saved[key].filter(id => allowed.includes(id)))];
      }
      if (!defaults.zones.includes('reef')) defaults.zones.push('reef');
      if (defaults.zones.includes(saved.zone)) defaults.zone = saved.zone;
    }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch {}
  }

  get stats() { return this.data.stats; }
  get cash() { return this.data.cash; }

  addFish(spec) {
    const id = spec.id;
    this.data.inventory[id] = (this.data.inventory[id] || 0) + 1;
    const rec = this.data.records[id] || { count: 0 };
    rec.count += 1;
    this.data.records[id] = rec;
    this.data.stats.caught += 1;
    this.save();
  }

  sellAll() {
    let total = 0;
    for (const [id, n] of Object.entries(this.data.inventory)) {
      total += (FISH_PRICES[id] || 20) * n;
    }
    const bonus = 1 + this.data.upgrades.sales * 0.15;
    total = Math.round(total * bonus);
    this.data.cash += total;
    this.data.inventory = {};
    this.save();
    return total;
  }

  addCash(n) {
    if (!Number.isSafeInteger(n) || n < 0) return false;
    this.data.cash += n;
    this.save();
  }

  spend(n) {
    if (!Number.isSafeInteger(n) || n < 0) return false;
    if (this.data.cash < n) return false;
    this.data.cash -= n;
    this.save();
    return true;
  }

  recordPhoto(name) {
    if (!this.data.photos[name]) this.data.stats.photos += 1;
    this.data.photos[name] = (this.data.photos[name] || 0) + 1;
    this.save();
  }

  addSpecimen(name) {
    this.data.rare[name] = true;
    this.data.stats.specimens += 1;
    this.save();
  }

  addDebris() {
    this.data.stats.debris += 1;
    this.save();
  }

  addFreed() {
    this.data.stats.freed += 1;
    this.save();
  }

  upgradeLevel(id) { return this.data.upgrades[id] || 0; }

  buyUpgrade(id) {
    const def = UPGRADES.find(u => u.id === id);
    if (!def) return false;
    const lvl = this.upgradeLevel(id);
    if (lvl >= def.max) return false;
    if (!this.spend(def.cost[lvl])) return false;
    this.data.upgrades[id] = lvl + 1;
    this.save();
    return true;
  }

  unlockZone(id) {
    const zone = ZONES.find(z => z.id === id);
    if (!zone || this.data.zones.includes(id)) return false;
    if (!this.spend(zone.cost)) return false;
    this.data.zones.push(id);
    this.save();
    return true;
  }

  visitZone(id) {
    if (!this.data.visited.includes(id)) {
      this.data.visited.push(id);
      this.data.cash += 50;
      this.save();
      return true; // first-visit exploration reward
    }
    this.save();
    return false;
  }

  missionProgress(m) { return Math.min(this.data.stats[m.stat] || 0, m.goal); }

  missionDone(m) { return this.missionProgress(m) >= m.goal; }

  claimMission(id) {
    const m = MISSIONS.find(x => x.id === id);
    if (!m || this.data.claimed.includes(id) || !this.missionDone(m)) return 0;
    this.data.claimed.push(id);
    this.data.cash += m.reward;
    this.save();
    return m.reward;
  }

  oxygenCapacity() { return 100 * (1 + this.upgradeLevel('oxygen') * 0.25); }

  reloadMultiplier() { return 1 - this.upgradeLevel('reload') * 0.2; }
}
