// Session keys for invisible on-chain settlement (Testnet).
//
// The player approves ONCE, in their wallet: a Function Call access key is
// added to their account, scoped to one contract (the merchant contract), the
// settlement methods, and a NEAR gas allowance. After that the game signs
// settlement transactions with this key in the background — no wallet popup
// per trade — and the signer on-chain stays the player's own account.
//
// What this key CANNOT do: move NEAR, call any other contract, or attach a
// deposit (at most 1 yocto, which is exactly what assert_one_yocto needs).
// The secret lives in localStorage; anyone with script access to the page
// could use it, but only within those limits. Never copy it to the server
// or into logs. Revoke it on-chain (DeleteKey) or here to kill it.
//
// Uses near-api-js@5.1.1 via esm.sh (same pattern as js/wallet.js) and the
// existing @near-wallet-selector setup for the one-time grant.
//
// Wired into the catch flow (js/online.js settles each catch in the
// background after the shot lands; the server signs receipts at
// POST /api/near/receipt-signature). The sell/buy transfer leg — moving the
// token to the merchant or another player with the session key after the CR
// sale commits — is still missing; see docs/SETTLEMENT_SESSION_KEYS.md.

import { KeyPair, keyStores, connect, transactions } from 'https://esm.sh/near-api-js@5.1.1';
import { testnetWallet, walletAccount } from './wallet.js';

export const RPC_URL = 'https://test.rpc.fastnear.com';
export const SESSION_METHODS = ['mint_catch', 'mt_transfer', 'mt_batch_transfer'];
export const DEFAULT_ALLOWANCE = '250000000000000000000000'; // 0.25 NEAR, gas only
export const SETTLEMENT_GAS = 100000000000000n; // 100 Tgas
const STORAGE_KEY = 'dsh.session.key';
const OUTBOX_KEY = 'dsh.session.outbox';

function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode: session key unavailable */ } }
function storageRemove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }

// The stored session key, or null. Shape: {accountId, publicKey, secretKey,
// contractId, methodNames, allowance, grantedAt}. The secretKey is the
// "ed25519:..." string form of the KeyPair.
export function loadSessionKey() {
  try {
    const raw = storageGet(STORAGE_KEY);
    if (!raw) return null;
    const key = JSON.parse(raw);
    if (!key || typeof key.secretKey !== 'string' || typeof key.accountId !== 'string' || typeof key.publicKey !== 'string') return null;
    return key;
  } catch { return null; }
}
export function hasSessionKey() { return loadSessionKey() !== null; }

// Ask the chain what this key can still do. Returns 'ok' | 'missing' |
// 'revoked' | 'unknown'. 'ok' also carries the remaining allowance.
export async function sessionKeyStatus() {
  const key = loadSessionKey();
  if (!key) return { status: 'missing' };
  try {
    const response = await fetch(RPC_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'dsh-session-key', method: 'query', params: { request_type: 'view_access_key', finality: 'final', account_id: key.accountId, public_key: key.publicKey } }) });
    const data = await response.json();
    if (data.error) return { status: 'revoked' };
    const permission = data.result?.permission;
    if (permission === 'FullAccess') return { status: 'unknown', reason: 'session key is full access, revoke it' };
    const call = permission?.FunctionCall;
    if (!call) return { status: 'revoked' };
    return { status: 'ok', allowance: call.allowance ?? null, receiverId: call.receiver_id, methodNames: call.method_names };
  } catch { return { status: 'unknown' }; }
}

// The one approval. Generates a fresh keypair, asks the wallet to add it as
// a Function Call key (one wallet confirmation), then stores the secret
// locally. If a valid key already exists for this account + contract, it is
// reused and no wallet popup appears.
export async function ensureSessionKey({ contractId, methodNames = SESSION_METHODS, allowance = DEFAULT_ALLOWANCE } = {}) {
  if (!contractId) throw new Error('Merchant contract not configured');
  const accountId = await walletAccount();
  if (!accountId) throw new Error('Sign in with a wallet first');
  const existing = loadSessionKey();
  if (existing && existing.accountId === accountId && existing.contractId === contractId) {
    const status = await sessionKeyStatus();
    if (status.status === 'ok') return existing;
    if (status.status === 'unknown') return existing; // RPC unreachable: keep the key, settle later
  }
  const keyPair = KeyPair.fromRandom('ed25519');
  const publicKey = keyPair.getPublicKey().toString();
  const wallet = await testnetWallet();
  await wallet.signAndSendTransaction({
    receiverId: accountId,
    actions: [{ type: 'AddKey', params: { publicKey, accessKey: { permission: { receiverId: contractId, allowance, methodNames } } } }],
  });
  const stored = { accountId, publicKey, secretKey: keyPair.toString(), contractId, methodNames, allowance, grantedAt: Date.now() };
  storageSet(STORAGE_KEY, JSON.stringify(stored));
  return stored;
}

// Delete the key on-chain (one wallet approval) and forget it locally.
export async function revokeSessionKey() {
  const key = loadSessionKey();
  if (!key) return false;
  const wallet = await testnetWallet();
  await wallet.signAndSendTransaction({
    receiverId: key.accountId,
    actions: [{ type: 'DeleteKey', params: { publicKey: key.publicKey } }],
  });
  storageRemove(STORAGE_KEY);
  storageRemove(OUTBOX_KEY);
  return true;
}

// Submit one function call signed with the session key. No wallet popup.
// Returns {hash, status}. Throws when the key is missing, revoked, or the
// allowance is spent (NotEnoughAllowance) — the caller must re-grant then.
export async function callWithSessionKey({ contractId, methodName, args, gas = SETTLEMENT_GAS, deposit = 1n } = {}) {
  const key = loadSessionKey();
  if (!key) throw new Error('No session key — grant it first');
  if (!contractId) throw new Error('Merchant contract not configured');
  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey('testnet', key.accountId, KeyPair.fromString(key.secretKey));
  const near = await connect({ networkId: 'testnet', keyStore, nodeUrl: RPC_URL, walletUrl: 'https://wallet.testnet.near.org', helperUrl: 'https://helper.testnet.near.org', headers: {} });
  const account = await near.account(key.accountId);
  const outcome = await account.signAndSendTransaction({
    receiverId: contractId,
    actions: [transactions.functionCall(methodName, args, BigInt(gas), BigInt(deposit))],
  });
  return { hash: outcome.transaction?.hash ?? outcome.transaction_outcome?.id, status: outcome.status };
}

// Settle one catch on-chain: mint the fish token to the catcher from a
// server-signed receipt. `receipt` is {receipt_id, player_id, species_id,
// title, signature}; the signature comes from the server receipt-signing
// endpoint (POST /api/near/receipt-signature).
export async function settleCatch({ contractId, receipt } = {}) {
  if (!receipt?.receipt_id || !receipt?.player_id || !receipt?.species_id || !receipt?.title || !receipt?.signature) throw new Error('Incomplete signed receipt');
  return callWithSessionKey({
    contractId,
    methodName: 'mint_catch',
    args: { receipt_id: receipt.receipt_id, player_id: receipt.player_id, species_id: receipt.species_id, title: receipt.title, signature: receipt.signature },
  });
}

// Outbox: a settlement that could not be sent stays queued and is retried on
// the next launch while a valid session key exists. The trade itself (CR)
// never waits on settlement, so a missed settlement is a missing receipt,
// not lost funds — the UI must show it as pending, never drop it silently.
export function queueSettlement(call) {
  let outbox = [];
  try { outbox = JSON.parse(storageGet(OUTBOX_KEY) || '[]'); } catch { outbox = []; }
  outbox.push({ ...call, queuedAt: Date.now() });
  storageSet(OUTBOX_KEY, JSON.stringify(outbox));
  return outbox.length;
}
export function pendingSettlements() {
  try { return JSON.parse(storageGet(OUTBOX_KEY) || '[]'); } catch { return []; }
}
export async function flushSettlements() {
  const outbox = pendingSettlements();
  const succeeded = [], failed = [];
  for (const call of outbox) {
    try { const result = await callWithSessionKey(call); succeeded.push({ ...call, hash: result.hash }); }
    catch (error) { failed.push({ ...call, error: error.message }); }
  }
  storageSet(OUTBOX_KEY, JSON.stringify(failed));
  return { succeeded, failed };
}
