export const PRICE_LIMITS = Object.freeze({ min: 1, maxMultiplier: 3, maxTickDeltaBps: 1000 });

// Merchant bankruptcy (Track 09: "if a merchant goes broke, it closes its shop
// until someone invests in it"). One rule, shared by server, ticks and Fast Forward:
// a merchant is broke when its available balance has fallen to its reserve floor,
// because the sell guard already blocks every purchase below that floor
// (available_balance - price < reserve_floor). A broke merchant closes immediately
// and reopens only through a player investment, never on its own.
export function isMerchantBankrupt({ availableBalance, reserveFloor }) {
  for (const [name, value] of Object.entries({ availableBalance, reserveFloor })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return availableBalance <= reserveFloor;
}

// CR a player must invest to reopen a broke merchant: one CR above the floor.
// Investing less keeps the shop closed; investing this much or more reopens it.
export function reopenAmountNeeded({ availableBalance, reserveFloor }) {
  if (isMerchantBankrupt({ availableBalance, reserveFloor })) return reserveFloor - availableBalance + 1;
  return 0;
}
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Shared pricing rule for PostgreSQL merchant ticks and local Fast Forward.
export function nextPrice({ basePrice, marketStock, targetStock, demand, population, capacity, previousPrice }) {
  for (const [name, value] of Object.entries({ basePrice, marketStock, targetStock, demand, population, capacity, previousPrice })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  if (basePrice < 1 || previousPrice < 1 || targetStock < 1 || capacity < 1 || marketStock > 1e9 || demand > 1e9 || population > capacity) throw new RangeError('invalid market inputs');
  const scarcityBps = clamp(Math.round((capacity - population) * 10_000 / capacity), 0, 10_000);
  const stockPressureBps = clamp(Math.round((targetStock - marketStock) * 5_000 / targetStock), -5_000, 5_000);
  const demandBps = clamp(demand * 100, 0, 5_000);
  const multiplierBps = clamp(10_000 + Math.round(scarcityBps / 2) + stockPressureBps + demandBps, 5_000, 30_000);
  const target = demand === 0
    ? Math.max(1, Math.floor(previousPrice * 0.9))
    : Math.max(1, Math.round(basePrice * multiplierBps / 10_000));
  const maxDelta = Math.max(1, Math.floor(previousPrice * PRICE_LIMITS.maxTickDeltaBps / 10_000));
  const price = clamp(target, Math.max(1, previousPrice - maxDelta), previousPrice + maxDelta);
  const reasons = [];
  if (scarcityBps >= 5_000) reasons.push('habitat population scarce');
  else if (scarcityBps <= 2_000) reasons.push('habitat population abundant');
  if (stockPressureBps > 0) reasons.push('merchant stock below target');
  else if (stockPressureBps < 0) reasons.push('merchant stock above target');
  if (demand === 0) reasons.push('merchant demand exhausted');
  else if (demandBps > 0) reasons.push('merchant demand');
  return { price, targetPrice: target, factors: { scarcityBps, stockPressureBps, demandBps, multiplierBps }, reason: reasons.join('; ') || 'balanced supply and demand' };
}
