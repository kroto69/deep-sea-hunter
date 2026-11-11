import test from 'node:test';
import assert from 'node:assert/strict';
import { crToYocto } from '../src/services/ticks.js';
import { broke, treasuryBroke } from '../src/services/merchant-agent.js';

test('1 CR = 0.0005 NEAR and broke when treasury below one unit', () => {
  assert.equal(crToYocto(18), 9n * 10n ** 21n); // 18 CR = 0.009 NEAR
  assert.equal(crToYocto('27'), 135n * 10n ** 20n);
  assert.equal(broke({ availableTreasury: '1' }, '2'), true);
  assert.equal(broke({ availableTreasury: '2' }, '2'), false);
  assert.equal(broke(null, '1'), true);
});

test('broke is one rule everywhere: treasury below cheapest order', () => {
  // No orders in front of it: only an exactly-empty treasury is broke.
  assert.equal(treasuryBroke('0', []), true);
  assert.equal(treasuryBroke('5', []), false);
  assert.equal(treasuryBroke(null, []), true);
  // The cheapest order decides, not the most expensive one.
  assert.equal(treasuryBroke('1', ['2']), true);
  assert.equal(treasuryBroke('2', ['2']), false);
  assert.equal(treasuryBroke('3', ['5', '2']), false);
  assert.equal(treasuryBroke('1', ['5', '2']), true);
  // The per-order check keeps its old meaning (unknown state is broke).
  assert.equal(broke({ availableTreasury: '1' }, '2'), true);
  assert.equal(broke({ availableTreasury: '2' }, '2'), false);
  assert.equal(broke(null, '1'), true);
});
