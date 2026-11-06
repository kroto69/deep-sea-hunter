import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPrice, regeneration } from '../src/domain/economy.js';

test('market price remains bounded and moves at most ten percent per tick', () => {
  const result = nextPrice({ basePrice: 50, marketStock: 0, targetStock: 20, demand: 100, population: 0, capacity: 100, previousPrice: 50 });
  assert.equal(result.price, 55);
  assert.ok(result.price >= 1 && result.price <= 150);
  assert.match(result.reason, /scarce/);
});

test('market pricing rejects population above capacity', () => {
  assert.throws(() => nextPrice({ basePrice: 10, marketStock: 0, targetStock: 1, demand: 0, population: 2, capacity: 1, previousPrice: 10 }), RangeError);
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
