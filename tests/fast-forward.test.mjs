import assert from 'node:assert/strict';
import { simulateSevenDays } from '../js/fast-forward.js';
const result = simulateSevenDays({ inventory: { fish: 3 }, treasury: 100, demand: { fish: 2 } });
assert.equal(result.days.length, 7);
assert.deepEqual(result.after.inventory, result.days[6].inventory);
assert.equal(result.after.treasury, result.days[6].treasury);
assert.ok(result.after.treasury >= 0);
assert.deepEqual(result, simulateSevenDays({ inventory: { fish: 3 }, treasury: 100, demand: { fish: 2 } }));

// A treasury at the reserve floor starts broke: the shop stays closed all week.
const broke = simulateSevenDays({ inventory: { fish: 3 }, treasury: 100, demand: { fish: 2 } });
assert.equal(broke.after.merchantClosed, true);
assert.equal(broke.after.bankruptDay, 1);
assert.equal(broke.after.treasury, 100);
assert.ok(broke.days.every(d => d.merchantClosed));
assert.ok(broke.days.flatMap(d => d.events).some(e => e.closed));

// Investing enough on day 2 reopens the shop and trading resumes.
const rescued = simulateSevenDays({ inventory: { fish: 3 }, treasury: 100, demand: { fish: 2 }, invest: { day: 2, amount: 2000 } });
assert.equal(rescued.after.merchantClosed, false);
assert.equal(rescued.after.reopenedDay, 2);
assert.equal(rescued.after.investedTotal, 2000);
assert.equal(rescued.days[0].merchantClosed, true);
assert.equal(rescued.days[6].merchantClosed, false);
assert.ok(rescued.days[1].events.some(e => e.type === 'invest' && e.reopened));
assert.throws(() => simulateSevenDays({ inventory: {}, treasury: 100, demand: {}, invest: { day: 8, amount: 100 } }), RangeError);
console.log('fast-forward simulation checks passed');
