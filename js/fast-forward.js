import { FISH_PRICES } from './progression.js';
import { nextPrice, isMerchantBankrupt, reopenAmountNeeded } from './economy-rules.js';

// Fast Forward: seven simulated days in about a minute, local-only.
// Same bankruptcy rule as the live merchant (see economy-rules.js): when the
// treasury falls to the reserve floor the shop closes and stops trading until
// a player invests. Pass invest {day: 1-7, amount} to preview a reopening:
// on that day the amount is added to the treasury before trading, and the
// shop reopens if the treasury rises above the floor.
export function simulateSevenDays({ inventory, treasury, demand, seed = 245, reserveFloor = 1000, invest = null }) {
  if (!Number.isSafeInteger(treasury) || treasury < 0) throw new TypeError('treasury must be a non-negative safe integer');
  if (!Number.isSafeInteger(reserveFloor) || reserveFloor < 0) throw new TypeError('reserveFloor must be a non-negative safe integer');
  if (invest !== null) {
    if (!Number.isSafeInteger(invest.day) || invest.day < 1 || invest.day > 7) throw new RangeError('invest.day must be 1-7');
    if (!Number.isSafeInteger(invest.amount) || invest.amount < 1) throw new RangeError('invest.amount must be a positive safe integer');
  }
  const state = { inventory: { ...inventory }, treasury, demand: { ...demand }, prices: { ...FISH_PRICES } };
  let closed = isMerchantBankrupt({ availableBalance: treasury, reserveFloor });
  let investedTotal = 0, bankruptDay = closed ? 1 : null, reopenedDay = null;
  let x = seed >>> 0;
  const rand = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  const days = [];
  for (let day = 1; day <= 7; day++) {
    const events = [];
    if (invest && invest.day === day) {
      state.treasury += invest.amount; investedTotal += invest.amount;
      const reopened = !isMerchantBankrupt({ availableBalance: state.treasury, reserveFloor });
      if (reopened) { closed = false; reopenedDay = day; }
      events.push({ type: 'invest', day, amount: invest.amount, treasuryAfter: state.treasury, reopened, neededAfter: reopenAmountNeeded({ availableBalance: state.treasury, reserveFloor }) });
    }
    for (const [species, wanted] of Object.entries(state.demand)) {
      const previousPrice = state.prices[species] || FISH_PRICES[species] || 20;
      if (closed) { events.push({ species, closed: true, bought: 0, supplied: 0, stockBefore: state.inventory[species] || 0, stockAfter: state.inventory[species] || 0, treasuryDelta: 0, demandBefore: wanted, demandAfter: wanted, priceBefore: previousPrice, price: previousPrice, reason: 'merchant closed: bankrupt' }); continue; }
      const stockBefore = state.inventory[species] || 0;
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
      if (isMerchantBankrupt({ availableBalance: state.treasury, reserveFloor })) { closed = true; if (bankruptDay === null) bankruptDay = day; events.push({ type: 'bankrupt', day, species, treasuryAfter: state.treasury, reserveFloor }); }
    }
    days.push({ day, events, inventory: { ...state.inventory }, treasury: state.treasury, demand: { ...state.demand }, prices: { ...state.prices }, merchantClosed: closed });
  }
  return { before: { inventory: { ...inventory }, treasury, demand: { ...demand }, prices: { ...FISH_PRICES } }, after: { ...state, merchantClosed: closed, investedTotal, bankruptDay, reopenedDay }, days };
}
