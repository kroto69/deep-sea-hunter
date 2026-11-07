import test from 'node:test';
import assert from 'node:assert/strict';
import { crToYocto } from '../src/services/ticks.js';
import { broke } from '../src/services/merchant-agent.js';

test('1 CR = 0.0005 NEAR and broke when treasury below one unit', () => {
  assert.equal(crToYocto(18), 9n * 10n ** 21n); // 18 CR = 0.009 NEAR
  assert.equal(crToYocto('27'), 135n * 10n ** 20n);
  assert.equal(broke({ availableTreasury: '1' }, '2'), true);
  assert.equal(broke({ availableTreasury: '2' }, '2'), false);
  assert.equal(broke(null, '1'), true);
});
