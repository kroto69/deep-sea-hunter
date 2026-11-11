import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

// Stub NEAR RPC: answers status + EXPERIMENTAL_tx_status with a canned
// merchant transaction, so recordSettlement can be driven end-to-end
// without Testnet. Env is set BEFORE any app module loads (env.js reads
// at import time). The stub is built inside the test so a skipped run
// without TEST_DATABASE_URL exits.
test('recordSettlement: verified accept_purchase_order hash lands in trade history', { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const CONTRACT = 'dsh-merchant-v2.deepfish-owner.testnet';
  const WALLET = 'demo.testnet';
  let txState = 'final'; // final | pending | failed
  let txOverrides = {};
  const txFixture = () => {
    const orderId = txOverrides.orderId;
    return {
      final_execution_status: txState === 'pending' ? 'STARTED' : 'FINAL',
      transaction: {
        hash: txOverrides.hash, signer_id: txOverrides.signer ?? WALLET, receiver_id: txOverrides.receiver ?? CONTRACT,
        actions: [{ FunctionCall: { method_name: txOverrides.method ?? 'accept_purchase_order', args: orderId ? Buffer.from(JSON.stringify({ order_id: orderId, amount: '1' })).toString('base64') : undefined } }],
      },
      status: txState === 'failed' ? { Failure: { error: 'boom' } } : { SuccessValue: '' },
      receipts_outcome: txState === 'final' ? [{ outcome: { executor_id: txOverrides.receiver ?? CONTRACT, status: { SuccessValue: '' }, logs: ['EVENT_JSON:' + JSON.stringify({ standard: 'nep245', event: 'mt_transfer' })] } }] : [],
    };
  };
  const stub = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const msg = JSON.parse(body || '{}');
      let result;
      if (msg.method === 'status') result = { chain_id: 'testnet' };
      else if (msg.method === 'EXPERIMENTAL_tx_status') result = txFixture();
      else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: 'unknown method' } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
    });
  });
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  process.env.NEAR_MERCHANT_CONTRACT_ID = CONTRACT;
  process.env.NEAR_RPC_URL = `http://127.0.0.1:${stub.address().port}`;

  const { testDatabase } = await import('./database.js');
  const { buildApp } = await import('../src/app.js');
  const { reconcilePending } = await import('../src/services/near.js');
  const f = await testDatabase(), db = f.db, app = buildApp(db);
  t.after(async () => { await app.close(); await f.close(); stub.close(); });

  const guest = async () => {
    const u = (await app.inject({ method: 'POST', url: '/api/sessions/guest' })).json();
    return { player: u.player, req: (method, url, payload, key = randomUUID()) => app.inject({ method, url, payload, headers: { authorization: `Bearer ${u.token}`, 'idempotency-key': key } }) };
  };
  const seller = await guest(), other = await guest();
  await db.query("UPDATE players SET wallet_account='demo.testnet' WHERE id=$1", [seller.player.id]);
  const catchOne = async (who) => {
    const hunt = (await who.req('POST', '/api/hunts', { habitatId: 'coral' })).json();
    await db.query("UPDATE player_equipment SET last_shot_at=clock_timestamp()-interval '2 seconds' WHERE player_id=$1", [who.player.id]);
    const r = await who.req('POST', `/api/hunts/${hunt.id}/shots`, { shotId: randomUUID(), speciesId: 'clownfish' });
    assert.equal(r.statusCode, 201, r.body);
    return r.json().receipt.id;
  };
  const record = (who, hash, receiptId) => who.req('POST', '/api/merchant-chain/settlements', { hash, receiptId });
  const H = (ch) => ch.repeat(43);

  // Final sale, matching order: recorded with receipt + species in history.
  txState = 'final';
  const receipt = await catchOne(seller);
  txOverrides = { hash: H('B'), orderId: `order-fish:${receipt}` };
  const rec = await record(seller, H('B'), receipt);
  assert.equal(rec.statusCode, 200, rec.body);
  assert.equal(rec.json().receipt_id, receipt);
  assert.equal(rec.json().method, 'accept_purchase_order');
  assert.equal(rec.json().status, 'final');
  assert.equal(rec.json().contract_id, CONTRACT);
  const list = await seller.req('GET', '/api/chain/transactions');
  assert.equal(list.statusCode, 200);
  const row = list.json().find((x) => x.hash === H('B'));
  assert.ok(row);
  assert.equal(row.species_name, 'Clownfish');
  assert.equal(row.receipt_id, receipt);

  // Idempotent re-record of the same hash + receipt.
  const again = await record(seller, H('B'), receipt);
  assert.equal(again.statusCode, 200, again.body);
  assert.equal(again.json().hash, H('B'));

  // Wrong method: storage_deposit is a merchant call but not a sale.
  const receipt2 = await catchOne(seller);
  txOverrides = { hash: H('C'), method: 'storage_deposit' };
  const wrongMethod = await record(seller, H('C'), receipt2);
  assert.equal(wrongMethod.statusCode, 409, wrongMethod.body);
  assert.equal(wrongMethod.json().error, 'settlement_method_not_supported');

  // Wrong receipt binding: the tx sold another receipt's token.
  txOverrides = { hash: H('D'), orderId: `order-fish:${receipt2}` };
  const wrongReceipt = await record(seller, H('D'), receipt);
  assert.equal(wrongReceipt.statusCode, 409, wrongReceipt.body);
  assert.equal(wrongReceipt.json().error, 'settlement_receipt_mismatch');

  // Wrong signer: someone else's tx cannot be recorded as mine.
  txOverrides = { hash: H('E'), signer: 'other.testnet', orderId: `order-fish:${receipt}` };
  const wrongSigner = await record(seller, H('E'), receipt);
  assert.equal(wrongSigner.statusCode, 400, wrongSigner.body);
  assert.equal(wrongSigner.json().error, 'transaction_mismatch');

  // Foreign receipt: another player's receipt is not mine.
  txOverrides = { hash: H('F'), orderId: `order-fish:${receipt}` };
  const foreign = await record(other, H('F'), receipt);
  assert.equal(foreign.statusCode, 404, foreign.body);

  // No verified wallet: a guest cannot record a settlement.
  const receipt3 = await catchOne(other);
  txOverrides = { hash: H('G'), orderId: `order-fish:${receipt3}` };
  const noWallet = await record(other, H('G'), receipt3);
  assert.equal(noWallet.statusCode, 401, noWallet.body);
  assert.equal(noWallet.json().error, 'wallet_not_verified');

  // Pending settlement records as pending, then reconcile flips it final
  // (this also proves reconcile() dispatches merchant rows to
  // verifyMerchantTransaction instead of failing them on the
  // collectibles receiver check).
  txState = 'pending';
  txOverrides = { hash: H('H'), orderId: `order-fish:${receipt2}` };
  const pend = await record(seller, H('H'), receipt2);
  assert.equal(pend.statusCode, 200, pend.body);
  assert.equal(pend.json().status, 'pending');
  txState = 'final';
  // reconcilePending only re-checks rows older than 30s (the background
  // loop's cadence); age the row to simulate that window passing.
  await db.query("UPDATE chain_transactions SET checked_at=clock_timestamp()-interval '31 seconds' WHERE hash=$1", [H('H')]);
  await reconcilePending(db);
  const after = (await seller.req('GET', '/api/chain/transactions')).json().find((x) => x.hash === H('H'));
  assert.equal(after.status, 'final');

  // Failed settlement is refused. ('J': 'I' is not a base58 character.)
  txState = 'failed';
  txOverrides = { hash: H('J'), orderId: `order-fish:${receipt2}` };
  const failed = await record(seller, H('J'), receipt2);
  assert.equal(failed.statusCode, 409, failed.body);
  assert.equal(failed.json().error, 'settlement_failed');
});
