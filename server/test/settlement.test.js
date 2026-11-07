import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { buildSettlementMessage, signReceipt, verifyReceiptSignature, settlementPublicKey } from '../src/services/settlement.js';

// The recorded Rust test vector (contracts/merchant/src/tests.rs): the exact
// signature the contract's own tests accept for this message. If this test
// fails, the JS message format has drifted from what mint_catch verifies.
const RUST_PUBKEY = '6dfac2fe0410f130b57cca064f55f30f226ba86966dcd53f4dc083256822e8d0';
const RUST_RECEIPT = '550e8400-e29b-41d4-a716-446655440000';
const RUST_SIGNATURE = '9c4843c5f5f0fe39092671d03b242486c43e86deedb9bf652275c5788c9a53a7117563116c6c3ca386e4bf9c339dfaeae14589e44b90ef1f79e973dcc096430d';
const RUST_MESSAGE = 'dsh-catch-v1\n550e8400-e29b-41d4-a716-446655440000\ndanny\nclownfish\nClownfish';

test('settlement message is the contract format, domain first', () => {
  assert.equal(buildSettlementMessage({ receiptId: RUST_RECEIPT, playerId: 'danny', speciesId: 'clownfish', title: 'Clownfish' }), RUST_MESSAGE);
  assert.throws(() => buildSettlementMessage({ receiptId: '', playerId: 'danny', speciesId: 'clownfish', title: 'Clownfish' }), TypeError);
});

test('recorded Rust mint_catch vector verifies under node:crypto', () => {
  assert.equal(verifyReceiptSignature({ publicKeyHex: RUST_PUBKEY, message: RUST_MESSAGE, signatureHex: RUST_SIGNATURE }), true);
  assert.equal(verifyReceiptSignature({ publicKeyHex: RUST_PUBKEY, message: RUST_MESSAGE + 'x', signatureHex: RUST_SIGNATURE }), false);
  assert.equal(verifyReceiptSignature({ publicKeyHex: RUST_PUBKEY, message: RUST_MESSAGE, signatureHex: RUST_SIGNATURE.slice(0, -2) + '00' }), false);
  assert.equal(verifyReceiptSignature({ publicKeyHex: '00'.repeat(32), message: RUST_MESSAGE, signatureHex: RUST_SIGNATURE }), false);
  assert.equal(verifyReceiptSignature({ publicKeyHex: 'zz', message: RUST_MESSAGE, signatureHex: RUST_SIGNATURE }), false);
});

test('signReceipt round-trips and derives the matching public key', () => {
  const key = generateKeyPairSync('ed25519');
  const seedHex = key.privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('hex');
  const expectedPubkey = key.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  assert.equal(settlementPublicKey(seedHex), expectedPubkey);
  const signed = signReceipt({ seedHex, receiptId: RUST_RECEIPT, playerId: 'danny.testnet', speciesId: 'clownfish', title: 'Clownfish' });
  assert.equal(signed.publicKey, expectedPubkey);
  assert.equal(verifyReceiptSignature({ publicKeyHex: expectedPubkey, message: signed.message, signatureHex: signed.signature }), true);
  // Deterministic: signing the same receipt twice returns the same signature.
  assert.equal(signReceipt({ seedHex, receiptId: RUST_RECEIPT, playerId: 'danny.testnet', speciesId: 'clownfish', title: 'Clownfish' }).signature, signed.signature);
  assert.throws(() => signReceipt({ seedHex: 'abcd', receiptId: RUST_RECEIPT, playerId: 'danny', speciesId: 'clownfish', title: 'Clownfish' }), TypeError);
  assert.throws(() => settlementPublicKey('zz'.repeat(32)), TypeError);
});
