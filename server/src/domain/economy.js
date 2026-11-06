export const PRICE_LIMITS = Object.freeze({ min: 1, maxMultiplier: 3, maxTickDeltaBps: 1000 });

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function nextPrice({ basePrice, marketStock, targetStock, demand, population, capacity, previousPrice }) {
  for (const [name, value] of Object.entries({ basePrice, marketStock, targetStock, demand, population, capacity, previousPrice })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  if (basePrice < 1 || previousPrice < 1 || targetStock < 1 || capacity < 1 || marketStock > 1e9 || demand > 1e9 || population > capacity) {
    throw new RangeError('invalid market inputs');
  }
  const scarcityBps = clamp(Math.round((capacity - population) * 10_000 / capacity), 0, 10_000);
  const stockPressureBps = clamp(Math.round((targetStock - marketStock) * 5_000 / targetStock), -5_000, 5_000);
  const demandBps = clamp(Math.round(demand * 100), 0, 5_000);
  const multiplierBps = clamp(10_000 + Math.round(scarcityBps / 2) + stockPressureBps + demandBps, 5_000, 30_000);
  const target = Math.max(1, Math.round(basePrice * multiplierBps / 10_000));
  const maxDelta = Math.max(1, Math.floor(previousPrice * PRICE_LIMITS.maxTickDeltaBps / 10_000));
  const price = clamp(target, Math.max(1, previousPrice - maxDelta), previousPrice + maxDelta);
  const reasons = [];
  if (scarcityBps >= 5_000) reasons.push('habitat population scarce');
  else if (scarcityBps <= 2_000) reasons.push('habitat population abundant');
  if (stockPressureBps > 0) reasons.push('merchant stock below target');
  else if (stockPressureBps < 0) reasons.push('merchant stock above target');
  if (demandBps > 0) reasons.push('merchant demand');
  return { price, targetPrice: target, factors: { scarcityBps, stockPressureBps, demandBps, multiplierBps }, reason: reasons.join('; ') || 'balanced supply and demand' };
}

// Existing constant regeneration retained for compatibility with earlier callers.
export function regeneration({ population, capacity, regenPerHourMilli, remainderNano = 0, elapsedMs, healthPpm = 1_000_000 }) {
  for (const [name, value] of Object.entries({ population, capacity, regenPerHourMilli, remainderNano, elapsedMs, healthPpm })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  if (capacity < 1 || population > capacity || healthPpm > 1_000_000) throw new RangeError('invalid population inputs');
  const cappedMs = Math.min(elapsedMs, 24 * 60 * 60 * 1000);
  const denom = 3_600_000_000_000n;
  const numerator = BigInt(regenPerHourMilli) * BigInt(healthPpm) * BigInt(cappedMs) * 1_000_000n
    + BigInt(remainderNano) * denom;
  const scaled = numerator / denom;
  const recovered = Number(scaled / 1_000_000_000n);
  return {
    population: Math.min(capacity, population + recovered),
    remainderNano: recovered >= capacity - population ? 0 : Number(scaled % 1_000_000_000n)
  };
}

export function logisticGrowth({ population, capacity, regenPerHourMilli, remainderNano = 0, elapsedMs, healthPpm = 1000000 }) {
  regeneration({ population, capacity, regenPerHourMilli, remainderNano, elapsedMs, healthPpm });
  if (remainderNano >= 1000000000) throw new RangeError('invalid fractional carry');
  const scale = 1000000000n, cap = BigInt(capacity) * scale;
  let n = BigInt(population) * scale + BigInt(remainderNano);
  // Rate is peak recovery in millifish/hour: dN/dt = 4g(N/K)(1-N/K).
  for (let remaining = Math.min(elapsedMs, 86400000); remaining > 0;) {
    const step = Math.min(remaining, 60000); remaining -= step;
    if (n >= cap) { n = cap; break; }
    const increment = 4n * BigInt(regenPerHourMilli) * BigInt(healthPpm) * BigInt(step) * scale * n * (cap - n)
      / (1000n * 1000000n * 3600000n * cap * cap);
    n += increment;
  }
  if (n > cap) n = cap;
  return { population: Number(n / scale), remainderNano: Number(n % scale) };
}

