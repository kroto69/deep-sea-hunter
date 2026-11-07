import assert from 'node:assert/strict';
import { simulateSevenDays } from '../js/fast-forward.js';
const result = simulateSevenDays({ inventory: { fish: 3 }, treasury: 100, demand: { fish: 2 } });
assert.equal(result.days.length, 7);
assert.deepEqual(result.after.inventory, result.days[6].inventory);
assert.equal(result.after.treasury, result.days[6].treasury);
assert.ok(result.after.treasury >= 0);
assert.deepEqual(result, simulateSevenDays({ inventory: { fish: 3 }, treasury: 100, demand: { fish: 2 } }));
console.log('fast-forward simulation checks passed');
