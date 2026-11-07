import { FISH_PRICES } from './progression.js';
import { nextPrice } from './economy-rules.js';

export function simulateSevenDays({ inventory, treasury, demand, seed = 245 }) {
  const state = { inventory: { ...inventory }, treasury, demand: { ...demand }, prices: { ...FISH_PRICES } };
  let x = seed >>> 0;
  const rand = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  const days = [];
  for (let day = 1; day <= 7; day++) {
    const events = [];
    for (const [species, wanted] of Object.entries(state.demand)) {
      const stockBefore = state.inventory[species] || 0;
      const previousPrice = state.prices[species] || FISH_PRICES[species] || 20;
      const market = nextPrice({ basePrice: FISH_PRICES[species] || 20, marketStock: stockBefore, targetStock: Math.max(1, wanted), demand: wanted + 1, population: 0, capacity: 100, previousPrice });
      const bought = Math.min(wanted, Math.floor(rand() * (wanted + 1)), Math.floor(state.treasury / market.price));
      const supplied = Math.floor(rand() * Math.max(1, Math.ceil(wanted / 2) + 1));
      state.inventory[species] = Math.max(0, stockBefore - bought) + supplied;
      state.treasury -= bought * market.price;
      const demandAfter = Math.max(0, wanted + supplied - bought);
      const updated = nextPrice({ basePrice: FISH_PRICES[species] || 20, marketStock: state.inventory[species], targetStock: Math.max(1, wanted), demand: demandAfter, population: 0, capacity: 100, previousPrice: market.price });
      state.demand[species] = demandAfter;
      state.prices[species] = updated.price;
      events.push({ species, supplied, bought, stockBefore, stockAfter: state.inventory[species], treasuryDelta: -bought * market.price, demandBefore: wanted, demandAfter, priceBefore: previousPrice, price: updated.price, reason: updated.reason });
    }
    days.push({ day, events, inventory: { ...state.inventory }, treasury: state.treasury, demand: { ...state.demand }, prices: { ...state.prices } });
  }
  return { before: { inventory: { ...inventory }, treasury, demand: { ...demand }, prices: { ...FISH_PRICES } }, after: state, days };
}
