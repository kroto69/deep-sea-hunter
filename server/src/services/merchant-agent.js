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

const broke = (state, unitPrice) => !state || BigInt(state.availableTreasury) < BigInt(unitPrice);

// Phase 2/4: mirror one off-chain buy order (species, qty 1, price in NEAR) onto the specific token
// that token owner holds. The contract keys orders by token, so species-level orders would never fill.
export async function ensureOrder({ tokenId, playerId, unitPrice, ttlMs = ORDER_TTL_MS }) {
  const orderId = `order-${tokenId}`;
  // ponytail: one order per token for life. Filled or expired orders are not reopened, which also
  // avoids burning gas on "duplicate order" reverts every tick. Add versioned order ids to relist.
  const existing = (await viewM('purchase_order', { order_id: orderId })).value;
  if (existing) return { status: existing.active && existing.expires_at > Date.now() ? 'already_open' : 'closed', orderId };
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
  // Broke is read from the same view the orders were checked against, so the API and the agent agree.
  const state = await chainState().catch(() => null);
  return { availableTreasury: state?.availableTreasury ?? null, broke: !!state && BigInt(state.availableTreasury) === 0n, placed };
}

export { broke };