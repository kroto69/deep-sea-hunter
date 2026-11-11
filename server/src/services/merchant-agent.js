import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { connect, keyStores, KeyPair } from 'near-api-js';
import { config } from '../config/env.js';
import { view } from './near.js';

// Testnet-only operator signing. The only key used is ~/.near-credentials/testnet/<owner>.json,
// so no secret lives in .env or in this repo.
const ORDER_TTL_MS = 10 * 60 * 1000;
let signerPromise;
async function signer() {
  if (signerPromise) return signerPromise;
  signerPromise = (async () => {
    const accountId = config.merchantOwnerId;
    if (!accountId || config.nearNetwork !== 'testnet') return null;
    const raw = await readFile(`${homedir()}/.near-credentials/testnet/${accountId}.json`, 'utf8').catch(() => null);
    const privateKey = raw ? JSON.parse(raw).private_key : '';
    if (!privateKey) return null;
    const keyStore = new keyStores.InMemoryKeyStore();
    await keyStore.setKey(config.nearNetwork, accountId, KeyPair.fromString(privateKey));
    const near = await connect({ networkId: config.nearNetwork, nodeUrl: config.nearRpcUrl, keyStore });
    return { accountId, near };
  })();
  return signerPromise;
}

export async function signerAvailable() { return !!(await signer()); }

const nearString = (v) => BigInt(v ?? 0).toString();

async function call(methodName, args, { deposit = '1', gas = 100_000_000_000_000 } = {}) {
  const s = await signer();
  if (!s) throw Object.assign(new Error('merchant_signer_unavailable'), { code: 'merchant_signer_unavailable' });
  const account = await s.near.account(s.accountId);
  const outcome = await account.functionCall({ contractId: config.merchantContractId, methodName, args, attachedDeposit: deposit, gas });
  const status = outcome.status || {};
  if (status.Failure) throw Object.assign(new Error('merchant_tx_failed'), { code: 'merchant_tx_failed', detail: status.Failure });
  const hash = outcome.transaction_outcome?.id;
  if (!hash) throw Object.assign(new Error('merchant_tx_unhashed'), { code: 'merchant_tx_unhashed' });
  return hash;
}

const viewM = (method, args) => view(method, args, config.merchantContractId);

export async function chainState(accountId) {
  if (!config.merchantContractId) return null;
  const [merchant, treasury, reserved, liabilities, claim] = await Promise.all([
    viewM('merchant_id', {}), viewM('treasury_available', {}), viewM('reserved_orders', {}),
    viewM('financial_liabilities', {}), accountId ? viewM('seller_claim', { account_id: accountId }) : null
  ]);
  return {
    contractId: config.merchantContractId, merchantId: merchant.value,
    availableTreasury: nearString(treasury.value), reservedOrders: nearString(reserved.value),
    liabilities: nearString(liabilities.value), sellerClaim: claim ? nearString(claim.value) : null
  };
}

// Player must exist on-chain before mint or the contract panics "Player not registered".
export async function isRegistered(accountId) {
  return !!(await viewM('storage_balance_of', { account_id: accountId })).value;
}

// One token per validated catch. asset_id is the receipt id, so a retry collides on the
// contract's "Token already minted" guard instead of doubling supply.
export async function mintAsset({ assetId, accountId, speciesId, title }) {
  const ok = await isRegistered(accountId);
  if (!ok) throw Object.assign(new Error('player_not_registered'), { code: 'player_not_registered' });
  return call('mint_asset', { asset_id: assetId, player_id: accountId, species_id: speciesId, title });
}

export async function tokenOrder(tokenId) {
  const { value } = await viewM('purchase_order', { order_id: `order-${tokenId}` });
  return value?.active && value.expires_at > Date.now() && Number(value.quantity) > 0 ? value : null;
}

export async function merchantStock(tokenId) {
  return nearString((await viewM('merchant_inventory', { token_id: tokenId })).value);
}

// The cheapest order the agent can ever place: PRICE_LIMITS.min is 1 CR
// (js/economy-rules.js) and the bridge is fixed at 1 CR = 0.0005 NEAR
// (crToYocto in ticks.js). Must stay equal to crToYocto(1) — pinned by
// test, not by import: ticks.js imports this module, so importing back
// would be a cycle. Assumes the deployed max_trade is at least 1 CR
// (deploy script sets 1000 NEAR); the clamp in ensureOrder can only
// lower a price toward max_trade, never below this floor in practice.
export const MIN_ORDER_YOCTO = 5n * 10n ** 20n;

// One definition of "broke" for the whole on-chain merchant: the treasury
// cannot fund the cheapest order in front of it. With no orders in front
// of it, the treasury is broke when it cannot fund even the cheapest
// possible order (MIN_ORDER_YOCTO) — a 1-yocto treasury is broke, not
// "not broke", because it cannot buy anything.
// NOTE on scope: the RULE is one, but the ORDER SET is scoped per caller —
// agentTick compares against this tick's wanted orders (global, at most
// 25), the API compares against this player's sellable orders, ensureOrder
// against the single order it places. The same treasury can therefore read
// broke in one place and not-broke in another; that is the flag answering
// different questions, not a disagreement about the rule.
export function treasuryBroke(availableTreasury, unitPrices) {
  const available = BigInt(availableTreasury ?? 0);
  if (!unitPrices?.length) return available < MIN_ORDER_YOCTO;
  let cheapest = BigInt(unitPrices[0]);
  for (const p of unitPrices) { const v = BigInt(p); if (v < cheapest) cheapest = v; }
  return available < cheapest;
}

// Pure summary of one tick's broke state, for the agent and for tests.
export function tickSummary(state, rows) {
  return { availableTreasury: state?.availableTreasury ?? null, broke: !!state && treasuryBroke(state.availableTreasury, rows.map(r => r.unitPrice)) };
}

// Pure API answer for one player: broke relative to THEIR sellable orders.
// Unknown chain state reports not-broke (read path: never a false alarm).
export function merchantBrokeFor(agent, unitPrices) {
  return !!agent && treasuryBroke(agent.availableTreasury, unitPrices);
}

// Per-order check (fail-safe for writes): unknown chain state counts as broke.
const broke = (state, unitPrice) => !state || treasuryBroke(state.availableTreasury, [unitPrice]);

// Phase 2/4: mirror one off-chain buy order (species, qty 1, price in NEAR) onto the specific token
// that token owner holds. The contract keys orders by token, so species-level orders would never fill.
export async function ensureOrder({ tokenId, playerId, unitPrice, ttlMs = ORDER_TTL_MS }) {
  const orderId = `order-${tokenId}`;
  // Relist (contract v3+): a closed order — filled or expired — no longer
  // blocks its token forever. The contract releases the old order's
  // unspent reserve when the id is reused, so the agent just retries the
  // create below. Against the old v2 contract the create still reverts
  // ("Invalid or duplicate order") and the catch maps it to already_open.
  const existing = (await viewM('purchase_order', { order_id: orderId })).value;
  if (existing?.active && existing.expires_at > Date.now()) return { status: 'already_open', orderId };
  const state = await chainState();
  if (broke(state, unitPrice)) return { status: 'broke', availableTreasury: state?.availableTreasury ?? '0' };
  const expiresAt = Math.min(Date.now() + ttlMs, Date.now() + ORDER_TTL_MS * 6);
  // expires_at must be a JSON number (u64); strings fail deserialization.
  const run = async (price) => call('create_purchase_order', {
    order_id: orderId, token_id: tokenId, quantity: '1', unit_price: String(price), expires_at: expiresAt
  });
  // max_trade caps a single order; clamp to it rather than failing the whole tick.
  const maxTrade = nearString((await viewM('max_trade', {})).value);
  const price = BigInt(unitPrice) > BigInt(maxTrade) ? maxTrade : BigInt(unitPrice);
  if (price <= 0n) return { status: 'price_too_low' };
  try {
    const hash = await run(price);
    return { status: 'placed', orderId, unitPrice: price.toString(), expiresAt, hash };
  } catch (error) {
    if (/duplicate order/.test(JSON.stringify(error.detail || error.message))) return { status: 'already_open', orderId };
    throw error;
  }
}

// Called with plain DB rows after the market transaction committed, never inside it.
export async function agentTick(rows) {
  if (!config.merchantContractId || !(await signerAvailable())) return { skipped: 'merchant_signer_unavailable' };
  const placed = [];
  for (const row of rows) {
    try {
      placed.push({ speciesId: row.species_id, tokenId: row.token_id, ...(await ensureOrder(row)) });
    } catch (error) {
      placed.push({ speciesId: row.species_id, tokenId: row.token_id, status: error.code || 'order_failed' });
    }
  }
  // Broke uses the same rule as ensureOrder above (treasury vs the cheapest
  // order this tick tried to place), read from the same view — so the API,
  // the agent, and the UI agree on the RULE (the order sets differ by
  // scope, see treasuryBroke). Unknown chain state reports not-broke
  // (read path: never a false alarm); the write path above stays fail-safe.
  const state = await chainState().catch(() => null);
  return { ...tickSummary(state, rows), placed };
}

export { broke };