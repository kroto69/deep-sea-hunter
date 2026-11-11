import test from 'node:test';
import assert from 'node:assert/strict';
import { receiptMintedOnChain } from '../src/services/merchant-agent.js';
import { assertNotMintedOnChain } from '../src/services/market.js';

const RECEIPT = '550e8400-e29b-41d4-a716-446655440000';
const CONTRACT = 'dsh-merchant-v2.deepfish-owner.testnet';

test('receiptMintedOnChain asks the chain for both token shapes', async () => {
  const calls = [];
  const view = async (method, args) => { calls.push([method, args]); return { value: ['1', null] }; };
  assert.equal(await receiptMintedOnChain(RECEIPT, view), true);
  assert.deepEqual(calls, [['mt_batch_supply', { token_ids: [`fish:${RECEIPT}`, `fish:catch-${RECEIPT}`] }]]);
});

test('receiptMintedOnChain is false only when neither token was ever minted', async () => {
  const none = async () => ({ value: [null, null] });
  assert.equal(await receiptMintedOnChain(RECEIPT, none), false);
  const zero = async () => ({ value: ['0', '0'] });
  assert.equal(await receiptMintedOnChain(RECEIPT, zero), false);
  const empty = async () => ({ value: null });
  assert.equal(await receiptMintedOnChain(RECEIPT, empty), false);
});

test('receiptMintedOnChain catches the auto-mint crash window too', async () => {
  // Operator minted fish:catch-{receipt} but died before recording it.
  const crashWindow = async () => ({ value: [null, '1'] });
  assert.equal(await receiptMintedOnChain(RECEIPT, crashWindow), true);
});

test('assertNotMintedOnChain enforces the guard and fails closed', async () => {
  const opts = (mintedFn) => ({ merchantContractId: CONTRACT, mintedFn });
  // Not minted: passes, and the receipt id reaches the chain check.
  let seen;
  await assertNotMintedOnChain(RECEIPT, opts(async (id) => { seen = id; return false; }));
  assert.equal(seen, RECEIPT);
  // Minted: refused with the same code as the DB guard.
  await assert.rejects(assertNotMintedOnChain(RECEIPT, opts(async () => true)), /catch_minted_onchain/);
  // Chain unreadable: refused rather than risking a double payment.
  await assert.rejects(assertNotMintedOnChain(RECEIPT, opts(async () => { throw new Error('rpc down'); })), /onchain_check_unavailable/);
});

test('assertNotMintedOnChain skips when no merchant contract is configured', async () => {
  let called = false;
  await assertNotMintedOnChain(RECEIPT, { merchantContractId: '', mintedFn: async () => { called = true; return true; } });
  assert.equal(called, false);
});
