import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
// The settlement key must be in process.env BEFORE any app module loads,
// because env.js reads it at import time. Every import below is dynamic.
const key = generateKeyPairSync('ed25519');
const seedHex = key.privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('hex');
const publicKeyHex = key.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
process.env.SETTLEMENT_SIGNING_KEY = seedHex;
process.env.NEAR_MERCHANT_CONTRACT_ID = 'dsh-merchant-v1.deepfish-owner.testnet';

test('receipt-signature endpoint signs the caller\'s own valid receipt', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const { testDatabase } = await import('./database.js');
  const { buildApp } = await import('../src/app.js');
  const { verifyReceiptSignature, buildSettlementMessage } = await import('../src/services/settlement.js');
  const f = await testDatabase(), db = f.db, app = buildApp(db); t.after(async () => { await app.close(); await f.close(); });
  const guest = async () => {
    const u = (await app.inject({ method: 'POST', url: '/api/sessions/guest' })).json();
    return { player: u.player, req: (method, url, payload) => app.inject({ method, url, payload, headers: { authorization: `Bearer ${u.token}`, 'idempotency-key': randomUUID() } }) };
  };
  const seller = await guest(), other = await guest();
  await db.query("UPDATE players SET wallet_account='demo.testnet' WHERE id=$1", [seller.player.id]);
  const catchFish = async (who, count) => {
    const hunt = (await who.req('POST', '/api/hunts', { habitatId: 'coral' })).json();
    const receipts = [];
    for (let i = 0; i < count; i++) {
      await db.query("UPDATE player_equipment SET last_shot_at=clock_timestamp()-interval '2 seconds' WHERE player_id=$1", [who.player.id]);
      const r = await who.req('POST', `/api/hunts/${hunt.id}/shots`, { shotId: randomUUID(), speciesId: 'clownfish' });
      assert.equal(r.statusCode, 201, r.body); receipts.push(r.json().receipt.id);
    }
    return receipts;
  };
  const receipts = await catchFish(seller, 2);
  const otherReceipt = (await catchFish(other, 1))[0];
  // The operator publishes this public key on the contract once.
  const pub = await seller.req('GET', '/api/near/settlement-key');
  assert.equal(pub.statusCode, 200, pub.body); assert.equal(pub.json().publicKey, publicKeyHex);
  // Sign the first receipt; the signature verifies under the public key.
  const signed = await seller.req('POST', '/api/near/receipt-signature', { receiptId: receipts[0] });
  assert.equal(signed.statusCode, 200, signed.body);
  const body = signed.json();
  assert.equal(body.player_id, 'demo.testnet'); assert.equal(body.species_id, 'clownfish'); assert.equal(body.title, 'Clownfish');
  assert.equal(body.contractId, 'dsh-merchant-v1.deepfish-owner.testnet');
  assert.equal(verifyReceiptSignature({ publicKeyHex, message: buildSettlementMessage({ receiptId: body.receipt_id, playerId: body.player_id, speciesId: body.species_id, title: body.title }), signatureHex: body.signature }), true);
  // Deterministic: the same receipt always yields the same signature.
  assert.equal((await seller.req('POST', '/api/near/receipt-signature', { receiptId: receipts[0] })).json().signature, body.signature);
  // Another player cannot sign a receipt they do not own.
  assert.equal((await other.req('POST', '/api/near/receipt-signature', { receiptId: receipts[0] })).statusCode, 404);
  // Unknown receipt.
  assert.equal((await seller.req('POST', '/api/near/receipt-signature', { receiptId: randomUUID() })).statusCode, 404);
  // Expired receipt cannot be signed.
  await db.query("UPDATE catch_receipts SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [receipts[1]]);
  const expired = await seller.req('POST', '/api/near/receipt-signature', { receiptId: receipts[1] });
  assert.equal(expired.statusCode, 409, expired.body); assert.equal(expired.json().error, 'receipt_unavailable');
  // A guest without a verified wallet has no NEAR account to mint to.
  const noWallet = await other.req('POST', '/api/near/receipt-signature', { receiptId: otherReceipt });
  assert.equal(noWallet.statusCode, 401, noWallet.body); assert.equal(noWallet.json().error, 'wallet_not_verified');
});

test('record-mint refuses unknown and foreign receipts', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const { testDatabase } = await import('./database.js');
  const { buildApp } = await import('../src/app.js');
  const f = await testDatabase(), db = f.db, app = buildApp(db); t.after(async () => { await app.close(); await f.close(); });
  const guest = async () => {
    const u = (await app.inject({ method: 'POST', url: '/api/sessions/guest' })).json();
    return { player: u.player, req: (method, url, payload) => app.inject({ method, url, payload, headers: { authorization: `Bearer ${u.token}`, 'idempotency-key': randomUUID() } }) };
  };
  const seller = await guest(), other = await guest();
  await db.query("UPDATE players SET wallet_account='demo.testnet' WHERE id=$1", [seller.player.id]);
  const hunt = (await seller.req('POST', '/api/hunts', { habitatId: 'coral' })).json();
  await db.query("UPDATE player_equipment SET last_shot_at=clock_timestamp()-interval '2 seconds' WHERE player_id=$1", [seller.player.id]);
  const shot = await seller.req('POST', `/api/hunts/${hunt.id}/shots`, { shotId: randomUUID(), speciesId: 'clownfish' });
  assert.equal(shot.statusCode, 201, shot.body);
  const receiptId = shot.json().receipt.id;
  // Another player cannot record a receipt they do not own.
  assert.equal((await other.req('POST', '/api/near/record-mint', { receiptId })).statusCode, 404);
  // Unknown receipt.
  assert.equal((await seller.req('POST', '/api/near/record-mint', { receiptId: randomUUID() })).statusCode, 404);
});
