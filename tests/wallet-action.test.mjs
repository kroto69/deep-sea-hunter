import assert from 'node:assert/strict';
import { functionCallAction } from '../js/wallet.js';

const action = functionCallAction('storage_deposit', {}, '7820000000000000000000');
assert.deepEqual(action.functionCall.args, new TextEncoder().encode('{}'));
assert.equal(action.functionCall.methodName, 'storage_deposit');
assert.equal(action.functionCall.gas, 100000000000000n);
assert.equal(action.functionCall.deposit, 7820000000000000000000n);
console.log('wallet function-call action checks passed');
