import test from 'node:test';
import assert from 'node:assert/strict';
import { crToYocto } from '../src/services/ticks.js';
import { broke, treasuryBroke, tickSummary, merchantBrokeFor, MIN_ORDER_YOCTO } from '../src/services/merchant-agent.js';

test('1 CR = 0.0005 NEAR and broke when treasury below one unit', () => {
  assert.equal(crToYocto(18), 9n * 10n ** 21n); // 18 CR = 0.009 NEAR
  assert.equal(crToYocto('27'), 135n * 10n ** 20n);
  assert.equal(broke({ availableTreasury: '1' }, '2'), true);
  assert.equal(broke({ availableTreasury: '2' }, '2'), false);
  assert.equal(broke(null, '1'), true);
});

test('broke is one rule everywhere: treasury below cheapest order', () => {
  // No orders in front of it: broke unless the treasury can fund even the
  // cheapest possible order (1 CR). A 1-yocto treasury is broke.
  assert.equal(treasuryBroke('0', []), true);
  assert.equal(treasuryBroke('1', []), true);
  assert.equal(treasuryBroke('499999999999999999999', []), true);
  assert.equal(treasuryBroke('500000000000000000000', []), false);
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

test('no-order floor is the cheapest order the agent can place', () => {
  // Pinned to the price bridge, not to a literal: if the bridge moves,
  // this fails instead of silently drifting.
  assert.equal(MIN_ORDER_YOCTO, crToYocto(1));
  assert.equal(MIN_ORDER_YOCTO, 5n * 10n ** 20n); // 1 CR = 0.0005 NEAR
});

test('all three call sites agree on the same treasury and order set', () => {
  const cases = [
    // [treasury, prices]
    ['0', []],
    ['1', []],
    ['499999999999999999999', []],
    ['500000000000000000000', []],
    ['1', ['2']],
    ['2', ['2']],
    ['3', ['5', '2']],
    ['1', ['5', '2']],
    ['1000000000000000000000', ['500000000000000000000']],
  ];
  for (const [treasury, prices] of cases) {
    const state = { availableTreasury: treasury };
    const rows = prices.map(p => ({ unitPrice: p }));
    const expected = treasuryBroke(treasury, prices);
    // Per-order check against the cheapest price in the set (or the floor
    // when the set is empty) must agree with the summary flags.
    const cheapest = prices.length ? prices.reduce((m, p) => BigInt(p) < BigInt(m) ? p : m) : MIN_ORDER_YOCTO.toString();
    assert.equal(broke(state, cheapest), expected, `broke ${treasury} vs [${prices}]`);
    assert.equal(tickSummary(state, rows).broke, expected, `tickSummary ${treasury} vs [${prices}]`);
    assert.equal(merchantBrokeFor(state, prices), expected, `merchantBrokeFor ${treasury} vs [${prices}]`);
    // Unknown chain state: write path stays fail-safe, read paths stay quiet.
    assert.equal(broke(null, cheapest), true);
    assert.equal(tickSummary(null, rows).broke, false);
    assert.equal(merchantBrokeFor(null, prices), false);
  }
});
