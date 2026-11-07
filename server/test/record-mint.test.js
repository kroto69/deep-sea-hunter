import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
// Env must be set BEFORE any app module loads (env.js reads it at import).
// Every import below is dynamic.
const key = generateKeyPairSync('ed25519');
const seedHex = key.privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('hex');
process.env.SETTLEMENT_SIGNING_KEY = seedHex;
process.env.NEAR_MERCHANT_CONTRACT_ID = 'dsh-merchant-v1.deepfish-owner.testnet';
process.env.NEAR_MERCHANT_OWNER_ID = 'deepfish-owner.testnet';
process.env.AUTO_MINT_ENABLED = 'true';

const { recordMint, receiptSignature } = await import('../src/services/settlement.js');
const { mintReceipt } = await import('../src/services/auto-mint.js');

const RECEIPT = randomUUID();
const validRow = (over = {}) => ({ id: RECEIPT, species_id: 'clownfish', species_name: 'Clownfish', name: 'Clownfish', status: 'valid', expires_at: new Date(Date.now() + 60000).toISOString(), token_id: null, wallet_account: 'demo.testnet', ...over });

// Fake db: answers the receipt lookup and the token_id UPDATE, records calls.
function fakeDb(row, { updateRowCount = 1 } = {}) {
  const calls = [];
  return { calls, query: async (sql, params) => {
    calls.push({ sql, params });
    if (/^UPDATE catch_receipts SET token_id/.test(sql)) return { rowCount: updateRowCount };
    if (/SELECT token_id FROM catch_receipts/.test(sql)) return { rows: [{ token_id: `fish:${RECEIPT}` }] };
    if (/FROM catch_receipts/.test(sql)) return { rows: row ? [row] : [] };
    return { rows: [] };
  } };
}
const viewBalance = (n) => async (method, args, contractId) => {
  assert.equal(method, 'mt_balance_of');
  assert.equal(args.token_id, `fish:${RECEIPT}`);
  assert.equal(contractId, 'dsh-merchant-v1.deepfish-owner.testnet');
  return { value: String(n) };
};
const noView = async () => { throw new Error('view must not be called'); };

test('record-mint records the token after an on-chain mint', async () => {
  const db = fakeDb(validRow());
  const out = await recordMint(db, { id: 'player-1' }, RECEIPT, viewBalance(1));
  assert.deepEqual(out, { receiptId: RECEIPT, tokenId: `fish:${RECEIPT}`, recorded: true });
  const update = db.calls.find(c => /^UPDATE catch_receipts SET token_id/.test(c.sql));
  assert.deepEqual(update.params, [`fish:${RECEIPT}`, RECEIPT]);
});

test('record-mint refuses a receipt whose token was never minted', async () => {
  const db = fakeDb(validRow());
  await assert.rejects(recordMint(db, { id: 'player-1' }, RECEIPT, viewBalance(0)), e => e.code === 'token_not_minted' && e.statusCode === 409);
  assert.equal(db.calls.some(c => /^UPDATE catch_receipts SET token_id/.test(c.sql)), false);
});

test('record-mint is idempotent when the receipt is already tokenized', async () => {
  const db = fakeDb(validRow({ token_id: 'fish:catch-abc' }));
  const out = await recordMint(db, { id: 'player-1' }, RECEIPT, noView);
  assert.deepEqual(out, { receiptId: RECEIPT, tokenId: 'fish:catch-abc', recorded: false });
});

test('record-mint 404s on unknown receipts, refuses sold receipts and wallet-less guests', async () => {
  await assert.rejects(recordMint(fakeDb(null), { id: 'player-1' }, RECEIPT, noView), e => e.code === 'receipt_not_found' && e.statusCode === 404);
  await assert.rejects(recordMint(fakeDb(validRow({ status: 'sold' })), { id: 'player-1' }, RECEIPT, noView), e => e.code === 'receipt_unavailable' && e.statusCode === 409);
  await assert.rejects(recordMint(fakeDb(validRow({ wallet_account: null })), { id: 'player-1' }, RECEIPT, noView), e => e.code === 'wallet_not_verified' && e.statusCode === 401);
});

test('receipt-signature reports the receipt token_id so the browser can skip an already-minted receipt', async () => {
  const minted = await receiptSignature(fakeDb(validRow({ token_id: 'fish:catch-abc' })), { id: 'player-1' }, RECEIPT);
  assert.equal(minted.tokenId, 'fish:catch-abc');
  const fresh = await receiptSignature(fakeDb(validRow()), { id: 'player-1' }, RECEIPT);
  assert.equal(fresh.tokenId, null);
});

test('auto-mint skips receipts the browser already tokenized', async () => {
  const out = await mintReceipt(fakeDb(validRow({ token_id: `fish:${RECEIPT}` })), { id: RECEIPT, speciesId: 'clownfish' });
  assert.deepEqual(out, { skipped: 'already_tokenized', tokenId: `fish:${RECEIPT}` });
});

test('auto-mint skips receipts whose player never bound a wallet', async () => {
  const out = await mintReceipt(fakeDb(validRow({ wallet_account: null })), { id: RECEIPT, speciesId: 'clownfish' });
  assert.deepEqual(out, { skipped: 'wallet_not_bound' });
});
