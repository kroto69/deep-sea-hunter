// Server side of invisible on-chain settlement (docs/SETTLEMENT_SESSION_KEYS.md).
//
// The server holds one ed25519 key (seed in SETTLEMENT_SIGNING_KEY, never in
// the repo). It signs each catch receipt exactly as the merchant contract's
// mint_catch expects: the newline-joined message
//   dsh-catch-v1\n{receipt_id}\n{player_id}\n{species_id}\n{title}
// where player_id is the player's VERIFIED NEAR wallet account (not the
// internal UUID) — mint_catch requires the predecessor to equal it.
// The signature is deterministic (ed25519), so re-signing the same receipt
// returns the same signature; the contract still enforces once-only minting
// via used_receipts, so a second signature grants nothing new.
//
// The pure functions here take the seed as a parameter and read no config,
// so they are unit-testable without a database. The endpoint handler below
// reads config.settlementSigningKey at call time.
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { fail } from './transaction.js';
import { view } from './near.js';
import { config } from '../config/env.js';

export const SETTLEMENT_MSG_DOMAIN = 'dsh-catch-v1';

// RFC 8410 DER prefixes for raw ed25519 keys (node:crypto needs DER, not raw).
const PUBLIC_DER_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const PRIVATE_DER_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export function buildSettlementMessage({ receiptId, playerId, speciesId, title }) {
  for (const [name, value] of Object.entries({ receiptId, playerId, speciesId, title })) {
    if (typeof value !== 'string' || !value) throw new TypeError(`${name} must be a non-empty string`);
  }
  return `${SETTLEMENT_MSG_DOMAIN}\n${receiptId}\n${playerId}\n${speciesId}\n${title}`;
}

function seedToKeyObjects(seedHex) {
  if (typeof seedHex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(seedHex)) throw new TypeError('settlement signing key must be a 64-hex-character ed25519 seed');
  const seed = Buffer.from(seedHex, 'hex');
  const privateKey = createPrivateKey({ key: Buffer.concat([PRIVATE_DER_PREFIX, seed]), format: 'der', type: 'pkcs8' });
  return { privateKey, publicKey: createPublicKey(privateKey) };
}

// The public key hex the owner publishes on the contract with
// set_settlement_key. Safe to expose: it is public by definition.
export function settlementPublicKey(seedHex) {
  const { publicKey } = seedToKeyObjects(seedHex);
  return publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
}

// Sign one receipt. Returns the message, the hex signature, and the pubkey.
export function signReceipt({ seedHex, receiptId, playerId, speciesId, title }) {
  const { privateKey, publicKey } = seedToKeyObjects(seedHex);
  const message = buildSettlementMessage({ receiptId, playerId, speciesId, title });
  const signature = sign(null, Buffer.from(message, 'utf8'), privateKey).toString('hex');
  return { message, signature, publicKey: publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex') };
}

export function verifyReceiptSignature({ publicKeyHex, message, signatureHex }) {
  if (typeof publicKeyHex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(publicKeyHex)) return false;
  if (typeof signatureHex !== 'string' || !/^[0-9a-fA-F]{128}$/.test(signatureHex)) return false;
  try {
    const publicKey = createPublicKey({ key: Buffer.concat([PUBLIC_DER_PREFIX, Buffer.from(publicKeyHex, 'hex')]), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(message, 'utf8'), publicKey, Buffer.from(signatureHex, 'hex'));
  } catch { return false; }
}

// POST /api/near/receipt-signature — sign the caller's own valid receipt.
// Guests without a verified wallet cannot settle on-chain: there is no NEAR
// account for mint_catch to pay the token to, so they keep playing off-chain.
export async function receiptSignature(db, identity, receiptId) {
  if (!config.settlementSigningKey) fail('settlement_not_configured', 503);
  if (!config.merchantContractId) fail('merchant_contract_not_configured', 503);
  const { rows: [r] } = await db.query(`SELECT r.id, r.species_id, r.status, r.expires_at, r.token_id, s.name AS species_name, p.wallet_account
    FROM catch_receipts r JOIN species s ON s.id = r.species_id JOIN players p ON p.id = r.player_id
    WHERE r.id = $1 AND r.player_id = $2`, [receiptId, identity.id]);
  if (!r) fail('receipt_not_found', 404);
  if (r.status !== 'valid' || Date.parse(r.expires_at) <= Date.now()) fail('receipt_unavailable');
  if (!r.wallet_account) fail('wallet_not_verified', 401);
  const { signature } = signReceipt({ seedHex: config.settlementSigningKey, receiptId: r.id, playerId: r.wallet_account, speciesId: r.species_id, title: r.species_name });
  return { receipt_id: r.id, player_id: r.wallet_account, species_id: r.species_id, title: r.species_name, signature, contractId: config.merchantContractId, tokenId: r.token_id || null };
}

// POST /api/near/record-mint — after the browser mints via mint_catch,
// record the token on the receipt so quote()/sell() refuse the off-chain CR
// sale of a tokenized fish. The token id is deterministic for session-key
// mints (fish:{receiptId}), and the server verifies on-chain via
// mt_balance_of that the token really sits in the catcher's wallet, so a
// client cannot claim a token that was never minted. Already-recorded
// receipts return idempotently without a chain call (e.g. operator
// auto-mint wrote fish:catch-{receiptId} first).
// Residual: this closes the hole for honest clients. A modified client could
// skip the record call and still sell off-chain; full robustness needs an
// on-chain ownership check inside sell() itself (not built).
export async function recordMint(db, identity, receiptId, viewFn = view) {
  if (!config.merchantContractId) fail('merchant_contract_not_configured', 503);
  const { rows: [r] } = await db.query(`SELECT r.id, r.status, r.expires_at, r.token_id, p.wallet_account
    FROM catch_receipts r JOIN players p ON p.id = r.player_id
    WHERE r.id = $1 AND r.player_id = $2`, [receiptId, identity.id]);
  if (!r) fail('receipt_not_found', 404);
  if (r.token_id) return { receiptId: r.id, tokenId: r.token_id, recorded: false };
  if (r.status !== 'valid' || Date.parse(r.expires_at) <= Date.now()) fail('receipt_unavailable');
  if (!r.wallet_account) fail('wallet_not_verified', 401);
  const tokenId = `fish:${r.id}`;
  const { value } = await viewFn('mt_balance_of', { account_id: r.wallet_account, token_id: tokenId }, config.merchantContractId);
  if (BigInt(value ?? 0) < 1n) fail('token_not_minted', 409);
  const { rowCount } = await db.query('UPDATE catch_receipts SET token_id=$2 WHERE id=$1 AND token_id IS NULL', [tokenId, r.id]);
  if (!rowCount) {
    const { rows: [again] } = await db.query('SELECT token_id FROM catch_receipts WHERE id=$1', [r.id]);
    return { receiptId: r.id, tokenId: again?.token_id || tokenId, recorded: false };
  }
  return { receiptId: r.id, tokenId, recorded: true };
}
