import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

// The double-sell guard (assertNotMintedOnChain) only runs when a merchant
// contract is configured, and it consults the chain through the RPC URL.
// Both must be in process.env BEFORE any app module loads, because env.js
// reads them at import time. The chain here is a stub that answers
// mt_batch_supply with a canned value, so the guard can be driven
// end-to-end without Testnet. The stub is built inside the test (not at
// module top level) so a skipped run without TEST_DATABASE_URL exits.
test('double-sell guard end-to-end: quote, sell and list consult the chain', { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  let stubSupply = [null, null];
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
      if (stubDown || msg.method !== 'query') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: 'stub down' } }));
        return;
      }
      // NEAR RPC returns call_function bytes as a number array; view() does
      // JSON.parse(Buffer.from(result.result).toString()).
      const result = { block_hash: 'stubhash', block_height: 1, result: Array.from(Buffer.from(JSON.stringify(stubSupply))) };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
    });
  });
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  process.env.NEAR_MERCHANT_CONTRACT_ID = 'dsh-merchant-v2.deepfish-owner.testnet';
  process.env.NEAR_RPC_URL = `http://127.0.0.1:${stub.address().port}`;

  const { testDatabase } = await import('./database.js');
  const { buildApp } = await import('../src/app.js');
  const { tick } = await import('../src/services/ticks.js');
  const f = await testDatabase(), db = f.db, app = buildApp(db);
  t.after(async () => { await app.close(); await f.close(); stub.close(); });

  // Quotes need live merchant orders: run the market tick, then pin a
  // clownfish order like market.integration.test.js does.
  await db.query("UPDATE merchant_accounts SET tick_started_at=clock_timestamp()-interval '2 minutes'");
  const tickResult = await tick(db);
  assert.ok(tickResult.orders > 0);
  await db.query(`INSERT INTO merchant_orders(id,merchant_id,species_id,quantity,unit_price,price_version,expires_at)
    SELECT gen_random_uuid(),d.merchant_id,d.species_id,LEAST(d.desired_quantity,10),s.base_price,ms.price_version,clock_timestamp()+interval '10 minutes'
    FROM merchant_demand d JOIN species s ON s.id=d.species_id JOIN market_state ms ON ms.species_id=s.id
    WHERE d.merchant_id='dock-merchant' AND d.species_id='clownfish'
    ON CONFLICT(merchant_id,species_id) DO UPDATE SET quantity=EXCLUDED.quantity,unit_price=EXCLUDED.unit_price,price_version=EXCLUDED.price_version,expires_at=EXCLUDED.expires_at`);

  const guest = async () => {
    const u = (await app.inject({ method: 'POST', url: '/api/sessions/guest' })).json();
    return { player: u.player, req: (method, url, payload, key = randomUUID()) => app.inject({ method, url, payload, headers: { authorization: `Bearer ${u.token}`, 'idempotency-key': key } }) };
  };
  const seller = await guest();
  const catchOne = async () => {
    const hunt = (await seller.req('POST', '/api/hunts', { habitatId: 'coral' })).json();
    await db.query("UPDATE player_equipment SET last_shot_at=clock_timestamp()-interval '2 seconds' WHERE player_id=$1", [seller.player.id]);
    const r = await seller.req('POST', `/api/hunts/${hunt.id}/shots`, { shotId: randomUUID(), speciesId: 'clownfish' });
    assert.equal(r.statusCode, 201, r.body);
    return r.json().receipt.id;
  };
  const quote = (id) => seller.req('GET', `/api/market/quotes?receiptId=${id}`);
  const sell = (quoteId) => seller.req('POST', '/api/market/sell', { quoteId });
  const balance = async () => Number((await db.query('SELECT balance FROM player_accounts WHERE player_id=$1', [seller.player.id])).rows[0].balance);

  // Session-key mint shape fish:{receipt} already on chain: quote refused.
  stubSupply = ['1', null];
  const minted = await catchOne();
  const qMinted = await quote(minted);
  assert.equal(qMinted.statusCode, 409, qMinted.body);
  assert.equal(qMinted.json().error, 'catch_minted_onchain');

  // Auto-mint crash window fish:catch-{receipt} on chain: quote refused.
  stubSupply = [null, '1'];
  const windowed = await catchOne();
  const qWindowed = await quote(windowed);
  assert.equal(qWindowed.statusCode, 409, qWindowed.body);
  assert.equal(qWindowed.json().error, 'catch_minted_onchain');

  // Mint lands between quote and sell: the quote was fine, the sell refuses.
  stubSupply = [null, null];
  const mid = await catchOne();
  const qMid = await quote(mid);
  assert.equal(qMid.statusCode, 200, qMid.body);
  stubSupply = ['1', null];
  const sMid = await sell(qMid.json().id);
  assert.equal(sMid.statusCode, 409, sMid.body);
  assert.equal(sMid.json().error, 'catch_minted_onchain');

  // Never minted: the full sale succeeds end-to-end.
  stubSupply = [null, null];
  const clean = await catchOne();
  const before = await balance();
  const qClean = await quote(clean);
  assert.equal(qClean.statusCode, 200, qClean.body);
  const sClean = await sell(qClean.json().id);
  assert.equal(sClean.statusCode, 200, sClean.body);
  assert.equal((await db.query("SELECT status FROM catch_receipts WHERE id=$1", [clean])).rows[0].status, 'sold');
  assert.ok((await balance()) > before);

  // Chain unreadable: fail closed. The guard fails 503 onchain_check_unavailable;
  // the HTTP error handler maps every 5xx to 500 internal_error.
  stubDown = true;
  const down = await catchOne();
  const qDown = await quote(down);
  assert.equal(qDown.statusCode, 500, qDown.body);
  assert.equal(qDown.json().error, 'internal_error');
  stubDown = false;

  // Shop listing is the third call site: minted refuses, unminted lists.
  await db.query('UPDATE player_accounts SET balance=1000 WHERE player_id=$1', [seller.player.id]);
  const license = await seller.req('POST', '/api/market/shops/license', {});
  assert.equal(license.statusCode, 200, license.body);
  const listed = await catchOne();
  stubSupply = ['1', null];
  const lMinted = await seller.req('POST', '/api/market/shops/list', { receiptId: listed, price: 25 });
  assert.equal(lMinted.statusCode, 409, lMinted.body);
  assert.equal(lMinted.json().error, 'catch_minted_onchain');
  stubSupply = [null, null];
  const lClean = await seller.req('POST', '/api/market/shops/list', { receiptId: listed, price: 25 });
  assert.equal(lClean.statusCode, 200, lClean.body);
});
