import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPrice, regeneration, isMerchantBankrupt, reopenAmountNeeded } from '../src/domain/economy.js';

test('market price remains bounded and moves at most ten percent per tick', () => {
  const result = nextPrice({ basePrice: 50, marketStock: 0, targetStock: 20, demand: 100, population: 0, capacity: 100, previousPrice: 50 });
  assert.equal(result.price, 55);
  assert.ok(result.price >= 1 && result.price <= 150);
  assert.match(result.reason, /scarce/);
});

test('price falls when merchant demand is exhausted', () => {
  const result = nextPrice({ basePrice: 50, marketStock: 20, targetStock: 20, demand: 0, population: 50, capacity: 100, previousPrice: 50 });
  assert.equal(result.price, 45);
  assert.match(result.reason, /demand exhausted/);
});

test('merchant is bankrupt at or below its reserve floor, open one CR above it', () => {
  assert.equal(isMerchantBankrupt({ availableBalance: 1000, reserveFloor: 1000 }), true);
  assert.equal(isMerchantBankrupt({ availableBalance: 0, reserveFloor: 1000 }), true);
  assert.equal(isMerchantBankrupt({ availableBalance: 1001, reserveFloor: 1000 }), false);
  assert.equal(reopenAmountNeeded({ availableBalance: 1000, reserveFloor: 1000 }), 1);
  assert.equal(reopenAmountNeeded({ availableBalance: 400, reserveFloor: 1000 }), 601);
  assert.equal(reopenAmountNeeded({ availableBalance: 1001, reserveFloor: 1000 }), 0);
  assert.throws(() => isMerchantBankrupt({ availableBalance: -1, reserveFloor: 1000 }), TypeError);
  assert.throws(() => reopenAmountNeeded({ availableBalance: 100, reserveFloor: -5 }), TypeError);
});

test('market pricing rejects population above capacity', () => {
  assert.throws(() => nextPrice({ basePrice: 10, marketStock: 0, targetStock: 1, demand: 0, population: 2, capacity: 1, previousPrice: 10 }), RangeError);
});

test('demo seed covers every catchable fish with distinct starting price and demand', async () => {
  const { readFile } = await import('node:fs/promises');
  const [seed, fish] = await Promise.all([
    readFile(new URL('../src/db/seed.js', import.meta.url), 'utf8'),
    readFile(new URL('../../js/fish.js', import.meta.url), 'utf8')
  ]);
  const seeded = [...seed.matchAll(/\{ id: '([^']+)', name: '[^']+', rarity: '[^']+', price: (\d+), need: (\d+),/g)];
  const catchable = [...fish.split('];', 1)[0].matchAll(/\{ id: '([^']+)', name:/g)].map(([, id]) => id);
  assert.equal(seeded.length, catchable.length);
  assert.deepEqual(seeded.map(([, id]) => id).sort(), catchable.sort());
  assert.ok(new Set(seeded.map(([, , price]) => price)).size > 1);
  assert.ok(new Set(seeded.map(([, , , need]) => need)).size > 1);
});

test('population regeneration carries fixed-point fractions and caps at capacity', () => {
  const p = { population: 3, capacity: 10, regenPerHourMilli: 1_800, elapsedMs: 1_000 };
  const one = regeneration(p);
  const two = regeneration({ ...p, remainderNano: one.remainderNano });
  assert.equal(one.population, 3);
  assert.equal(two.population, 3);
  assert.ok(two.remainderNano > one.remainderNano);
  assert.deepEqual(regeneration({ population: 9, capacity: 10, regenPerHourMilli: 10_000_000, elapsedMs: 3_600_000 }), { population: 10, remainderNano: 0 });
});
