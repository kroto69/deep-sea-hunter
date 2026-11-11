import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

// NOTE: no static import of any src/ module here — ticks.js transitively
// loads env.js at import time, so crToYocto is imported dynamically below
// after the env vars are set (same pattern as the other integration tests).

// Stub NEAR RPC: answers status + view_account (the owner payout
// account's balance), so the funding check can be driven without Testnet.
// The NEAR send itself is never a real chain call here: service-level
// cases inject a fake send, and there is deliberately NO HTTP happy-path
// test — the route's default chain would move real NEAR on a machine
// that holds the owner key. Env is set BEFORE any app module loads.
// The stub is built inside the test so a skipped run without
// TEST_DATABASE_URL exits.
test('CR -> NEAR withdrawal: debit, pay, refund, resume', { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const CONTRACT = 'dsh-merchant-v2.deepfish-owner.testnet';
  const OWNER = 'dsh-owner.testnet';
  let ownerBalance = 10n ** 26n; // 100 NEAR
  let stubDown = false;
  const stub = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const msg = JSON.parse(body || '{}');
      if (msg.method === 'status') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { chain_id: 'testnet' } }));
        return;
      }
      if (stubDown || msg.method !== 'query' || msg.params?.request_type !== 'view_account') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: 'stub down' } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { amount: ownerBalance.toString(), locked: '0' } }));
    });
  });
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  process.env.NEAR_MERCHANT_CONTRACT_ID = CONTRACT;
  process.env.NEAR_MERCHANT_OWNER_ID = OWNER;
  process.env.NEAR_RPC_URL = `http://127.0.0.1:${stub.address().port}`;

  const { testDatabase } = await import('./database.js');
  const { buildApp } = await import('../src/app.js');
  const { createGuestSession } = await import('../src/services/sessions.js');
  const { withdrawCr } = await import('../src/services/withdraw.js');
  const { crToYocto } = await import('../src/services/ticks.js');
  const f = await testDatabase(), db = f.db, app = buildApp(db);
  t.after(async () => { await app.close(); await f.close(); stub.close(); });

  const newPlayer = async (balance = 5000) => {
    const session = await createGuestSession(db);
    const identity = { id: session.playerId, sessionId: session.sessionId };
    // players.wallet_account is UNIQUE: one wallet per test player.
    identity.wallet = 'demo' + identity.id.replace(/-/g, '').slice(0, 8) + '.testnet';
    await db.query('UPDATE players SET wallet_account=$2 WHERE id=$1', [identity.id, identity.wallet]);
    await db.query('UPDATE player_accounts SET balance=$2 WHERE player_id=$1', [identity.id, balance]);
    return identity;
  };
  const playerBalance = async (id) => Number((await db.query('SELECT balance FROM player_accounts WHERE player_id=$1', [id])).rows[0].balance);
  const gameBalance = async () => Number((await db.query("SELECT balance FROM game_treasury WHERE id='main'")).rows[0].balance);
  const ledgerSum = async (txId) => (await db.query('SELECT COALESCE(SUM(delta),0) AS s FROM ledger_entries WHERE transaction_id=$1', [txId])).rows[0].s;
  const refundCount = async (playerId) => Number((await db.query("SELECT COUNT(*) AS n FROM economy_transactions WHERE kind='cr_withdrawal_refund' AND player_id=$1", [playerId])).rows[0].n);
  const fakeHash = 'C'.repeat(43);
  const richChain = (sendImpl) => ({ balanceOf: async () => ownerBalance, send: sendImpl });

  // Happy path (service level, fake send): debit + paid + balanced ledger.
  const alice = await newPlayer(5000);
  const gameBefore = await gameBalance();
  const keyA = randomUUID();
  const paid = await withdrawCr(db, alice, 1000, keyA, { chain: richChain(async (to, amount) => { assert.equal(to, alice.wallet); assert.equal(amount, crToYocto(1000)); return fakeHash; }) });
  assert.equal(paid.status, 'paid');
  assert.equal(paid.tx_hash, fakeHash);
  assert.equal(paid.amount_cr, '1000');
  assert.equal(paid.amount_yocto, crToYocto(1000).toString());
  assert.equal(paid.wallet_account, alice.wallet);
  assert.equal(await playerBalance(alice.id), 4000);
  assert.equal(await gameBalance(), gameBefore + 1000);
  assert.equal(await ledgerSum(paid.id), '0');
  assert.equal((await db.query("SELECT kind FROM economy_transactions WHERE id=$1", [paid.id])).rows[0].kind, 'cr_withdrawal');

  // Same idempotency key resumes the paid row: no second debit, no second send.
  let sends = 0;
  const resumed = await withdrawCr(db, alice, 1000, keyA, { chain: richChain(async () => { sends++; return 'D'.repeat(43); }) });
  assert.equal(resumed.id, paid.id);
  assert.equal(resumed.status, 'paid');
  assert.equal(sends, 0);
  assert.equal(await playerBalance(alice.id), 4000);

  // Send failure: failed + CR refunded + sink reversed, one refund row.
  const bob = await newPlayer(5000);
  const gameBeforeBob = await gameBalance();
  const keyB = randomUUID();
  const failed = await withdrawCr(db, bob, 2000, keyB, { chain: richChain(async () => { throw Object.assign(new Error('boom'), { code: 'merchant_tx_failed' }); }) });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.refunded, true);
  assert.equal(failed.error, 'merchant_tx_failed');
  assert.equal(await playerBalance(bob.id), 5000);
  assert.equal(await gameBalance(), gameBeforeBob);
  assert.equal(await refundCount(bob.id), 1);
  const refundTx = (await db.query("SELECT id FROM economy_transactions WHERE kind='cr_withdrawal_refund' AND player_id=$1", [bob.id])).rows[0].id;
  assert.equal(await ledgerSum(refundTx), '0');

  // Resuming the failed row returns it without a second refund.
  const resumedFailed = await withdrawCr(db, bob, 2000, keyB, { chain: richChain(async () => fakeHash) });
  assert.equal(resumedFailed.id, failed.id);
  assert.equal(resumedFailed.status, 'failed');
  assert.equal(await refundCount(bob.id), 1);
  assert.equal(await playerBalance(bob.id), 5000);

  // Pending row whose send was attempted but whose outcome was lost:
  // never re-sent, goes to needs_review, no debit happened.
  const carol = await newPlayer(5000);
  const keyC = randomUUID();
  await db.query(`INSERT INTO cr_withdrawals(id, player_id, wallet_account, amount_cr, amount_yocto, status, send_attempted_at, idempotency_key)
    VALUES($1,$2,$3,1000,$4,'pending',clock_timestamp(),$5)`, [randomUUID(), carol.id, carol.wallet, crToYocto(1000).toString(), `${carol.id}:${keyC}`]);
  const review = await withdrawCr(db, carol, 1000, keyC, { chain: richChain(async () => { throw new Error('must not send'); }) });
  assert.equal(review.status, 'needs_review');
  assert.equal(await playerBalance(carol.id), 5000);

  // Validation, config, wallet, and balance gates (service level).
  await assert.rejects(withdrawCr(db, alice, 99, randomUUID(), { chain: richChain(async () => fakeHash) }), /invalid_withdrawal_amount/);
  await assert.rejects(withdrawCr(db, alice, 10001, randomUUID(), { chain: richChain(async () => fakeHash) }), /invalid_withdrawal_amount/);
  await assert.rejects(withdrawCr(db, alice, 1.5, randomUUID(), { chain: richChain(async () => fakeHash) }), /invalid_withdrawal_amount/);
  await assert.rejects(withdrawCr(db, alice, 1000, randomUUID(), { chain: richChain(async () => fakeHash), merchantContractId: '' }), /merchant_contract_not_configured/);
  await assert.rejects(withdrawCr(db, alice, 1000, randomUUID(), { chain: richChain(async () => fakeHash), merchantOwnerId: '' }), /merchant_signer_unavailable/);
  const noWalletSession = await createGuestSession(db);
  await assert.rejects(withdrawCr(db, { id: noWalletSession.playerId, sessionId: noWalletSession.sessionId }, 1000, randomUUID(), { chain: richChain(async () => fakeHash) }), /wallet_not_verified/);
  const poor = await newPlayer(50);
  await assert.rejects(withdrawCr(db, poor, 1000, randomUUID(), { chain: richChain(async () => fakeHash) }), /insufficient_credits/);

  // Owner cannot fund it (real default chain + stub view_account): 409,
  // nothing debited, no withdrawal row.
  ownerBalance = 1000n;
  const dave = await newPlayer(5000);
  await assert.rejects(withdrawCr(db, dave, 1000, randomUUID()), /withdrawal_funds_unavailable/);
  assert.equal(await playerBalance(dave.id), 5000);
  assert.equal(Number((await db.query('SELECT COUNT(*) AS n FROM cr_withdrawals WHERE player_id=$1', [dave.id])).rows[0].n), 0);
  ownerBalance = 10n ** 26n;

  // Chain down (real default chain + stub error): 503 fail-closed, no debit.
  stubDown = true;
  const erin = await newPlayer(5000);
  await assert.rejects(withdrawCr(db, erin, 1000, randomUUID()), /near_rpc_unavailable/);
  assert.equal(await playerBalance(erin.id), 5000);
  stubDown = false;

  // HTTP level: schema validation + no-wallet + list. (No HTTP happy-path
  // test: the route's default chain would move real NEAR on a machine
  // that holds the owner key; the money flow is covered above.)
  const guest = async () => {
    const u = (await app.inject({ method: 'POST', url: '/api/sessions/guest' })).json();
    return { player: u.player, req: (method, url, payload, key = randomUUID()) => app.inject({ method, url, payload, headers: { authorization: `Bearer ${u.token}`, 'idempotency-key': key } }) };
  };
  const frank = await guest();
  await db.query("UPDATE players SET wallet_account='demo.testnet' WHERE id=$1", [frank.player.id]);
  await db.query('UPDATE player_accounts SET balance=5000 WHERE player_id=$1', [frank.player.id]);
  const bad = await frank.req('POST', '/api/near/withdraw-cr', { amountCr: 50 });
  assert.equal(bad.statusCode, 400);
  const noWalletHttp = await guest();
  const nw = await noWalletHttp.req('POST', '/api/near/withdraw-cr', { amountCr: 1000 });
  assert.equal(nw.statusCode, 401, nw.body);
  assert.equal(nw.json().error, 'wallet_not_verified');
  const list = await frank.req('GET', '/api/near/withdrawals');
  assert.equal(list.statusCode, 200);
  assert.ok(Array.isArray(list.json()));
  assert.deepEqual(list.json(), []); // frank never withdrew
});
