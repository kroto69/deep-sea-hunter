// CR -> NEAR withdrawal (docs/SETTLEMENT_SESSION_KEYS.md, "Withdrawal").
//
// FUNDING DECISION — read this before touching the payout source.
// The NEAR a withdrawal pays comes from the OPERATOR'S OWNER ACCOUNT
// (config.merchantOwnerId, the account whose key signs this server's
// contract calls). That is the only account this server can sign from,
// and it is the only honest source the code supports:
//   - The merchant contract's native_treasury cannot pay an arbitrary
//     amount to an arbitrary account: there is no such method. The only
//     NEAR that leaves the contract is withdraw_proceeds (the caller's
//     own seller claim — the server cannot call it for the player, the
//     predecessor would be the owner account) and storage_unregister
//     (the caller's own storage refund). A CR -> NEAR conversion is
//     neither: the player did not sell a token, they hold off-chain CR.
//   - The treasury_id account from the contract's new() holds NEAR, but
//     this server holds no key for it — only the owner key lives in
//     ~/.near-credentials.
//   - The game treasury (game_treasury table) holds CR only, never NEAR;
//     it is the sink for the debited CR, not the source of the payout.
// So every withdrawal drains the operator's owner account. The operator
// funds it manually (fund the account, not the contract), the payout is
// capped per call (MAX_WITHDRAW_CR), and the owner balance is checked
// before any CR is debited. The CR side and the NEAR side are different
// treasuries by design: the game accumulates CR it cannot spend, the
// operator pays real NEAR for it. That makes CR -> NEAR a subsidised
// conversion, not a market — price it accordingly.
//
// The rate is the fixed bridge, 1 CR = 0.0005 NEAR (crToYocto, ticks.js).
// The CR price itself stays dynamic; the bridge does not.
//
// SAFETY SHAPE — money moves in two phases because a chain send cannot
// roll back with a database transaction:
//   1. One DB transaction debits the player's CR (player -> game treasury
//      sink), writes a balanced ledger entry, and inserts the withdrawal
//      row as 'pending'. It commits before any NEAR moves.
//   2. The row is marked send_attempted_at, the NEAR is sent, and the row
//      becomes 'paid' with the tx hash — or, on send failure, the CR is
//      refunded in a second balanced ledger entry and the row becomes
//      'failed'.
// Retrying with the same idempotency key resumes a pending row instead of
// debiting twice: 'paid' returns the paid record, 'failed' returns the
// failed record (the CR is already refunded — submit a new request), a
// 'pending' row whose send was never attempted is attempted now, and a
// 'pending' row whose send WAS attempted but whose outcome was lost is
// never re-sent (double-pay risk) — it goes to 'needs_review' for the
// operator. A failed send never loses the player's CR, and a lost
// outcome never double-pays.
import { crToYocto } from './ticks.js';
import { accountBalance } from './near.js';
import { sendNear } from './merchant-agent.js';
import { fail, ledger, playerTransaction, transaction } from './transaction.js';
import { config } from '../config/env.js';

// Payout limits, in CR. Min 100 CR (0.05 NEAR) keeps payouts above dust:
// below that the operator's NEAR is worth more than the CR is. Max
// 10_000 CR (5 NEAR) caps the operator's exposure per call.
export const MIN_WITHDRAW_CR = 100;
export const MAX_WITHDRAW_CR = 10_000;
// The owner account keeps this much NEAR after any payout, so it can
// keep paying gas for its own contract calls (orders, auto-mint).
export const OWNER_PAYOUT_RESERVE_YOCTO = 10n ** 23n; // 0.1 NEAR

const defaultChain = {
  balanceOf: (accountId) => accountBalance(accountId),
  send: (to, amountYocto) => sendNear(to, amountYocto),
};

export async function withdrawCr(db, identity, amountCr, idempotencyKey, { chain = defaultChain, merchantContractId = config.merchantContractId, merchantOwnerId = config.merchantOwnerId } = {}) {
  if (!Number.isSafeInteger(amountCr) || amountCr < MIN_WITHDRAW_CR || amountCr > MAX_WITHDRAW_CR) fail('invalid_withdrawal_amount', 400);
  if (!merchantContractId) fail('merchant_contract_not_configured', 503);
  if (!merchantOwnerId) fail('merchant_signer_unavailable', 503);
  const scoped = `${identity.id}:${idempotencyKey}`;
  // Resume, never double-debit: a repeat of the same key returns the
  // existing row without re-checking funds or debiting again.
  const existing = (await db.query('SELECT * FROM cr_withdrawals WHERE idempotency_key=$1 AND player_id=$2', [scoped, identity.id])).rows[0];
  if (existing) return resumeWithdrawal(db, existing, chain);
  const amountYocto = crToYocto(amountCr);
  // Fail-closed funding check, BEFORE any CR moves: the payout plus the
  // owner reserve must fit in the owner account. A dead chain refuses
  // the withdrawal instead of debiting CR for NEAR that may never come.
  let ownerBalance;
  try {
    ownerBalance = await chain.balanceOf(merchantOwnerId);
  } catch {
    fail('near_rpc_unavailable', 503);
  }
  if (BigInt(ownerBalance) < amountYocto + OWNER_PAYOUT_RESERVE_YOCTO) fail('withdrawal_funds_unavailable', 409);
  // Phase 1: debit CR + balanced ledger + pending row, one transaction.
  const row = await playerTransaction(db, identity, idempotencyKey, async (c, key) => {
    const p = (await c.query('SELECT wallet_account FROM players WHERE id=$1', [identity.id])).rows[0];
    if (!p?.wallet_account) fail('wallet_not_verified', 401);
    const balance = (await c.query('UPDATE player_accounts SET balance=balance-$2,version=version+1 WHERE player_id=$1 AND balance>=$2 RETURNING balance', [identity.id, amountCr])).rows[0]?.balance;
    if (balance === undefined) fail('insufficient_credits');
    const id = await ledger(c, { playerId: identity.id, key, kind: 'cr_withdrawal', amount: BigInt(amountCr), reference: p.wallet_account, from: ['player', identity.id], to: ['game', 'main'], result: { amountCr, amountYocto: amountYocto.toString(), walletAccount: p.wallet_account } });
    await c.query('UPDATE game_treasury SET balance=balance+$2,version=version+1 WHERE id=$1', ['main', amountCr]);
    const { rows: [w] } = await c.query(`INSERT INTO cr_withdrawals(id, player_id, wallet_account, amount_cr, amount_yocto, idempotency_key)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [id, identity.id, p.wallet_account, amountCr, amountYocto.toString(), scoped]);
    return w;
  });
  return attemptSend(db, row, chain);
}

// Resume path for a repeated idempotency key. Pure dispatch on the row:
// paid/failed/needs_review are returned as-is; pending without an
// attempt is tried now; pending WITH an attempt has an unknown outcome —
// never re-send.
async function resumeWithdrawal(db, row, chain) {
  if (row.status === 'paid' || row.status === 'failed' || row.status === 'needs_review') return row;
  if (row.send_attempted_at) {
    const { rows: [updated] } = await db.query("UPDATE cr_withdrawals SET status='needs_review', updated_at=clock_timestamp() WHERE id=$1 RETURNING *", [row.id]);
    return updated;
  }
  return attemptSend(db, row, chain);
}

// Phase 2: mark the attempt (so a crash after this point is visible as
// "attempted, outcome unknown" instead of silently retryable), send the
// NEAR, then mark paid — or refund the CR and mark failed.
async function attemptSend(db, row, chain) {
  await db.query('UPDATE cr_withdrawals SET send_attempted_at=clock_timestamp(), updated_at=clock_timestamp() WHERE id=$1', [row.id]);
  let hash;
  try {
    hash = await chain.send(row.wallet_account, BigInt(row.amount_yocto));
  } catch (error) {
    await refundWithdrawal(db, row, error);
    const { rows: [failed] } = await db.query("UPDATE cr_withdrawals SET status='failed', error=$2, refunded=TRUE, updated_at=clock_timestamp() WHERE id=$1 RETURNING *", [row.id, error.code || error.message || 'send_failed']);
    return failed;
  }
  const { rows: [paid] } = await db.query("UPDATE cr_withdrawals SET status='paid', tx_hash=$2, updated_at=clock_timestamp() WHERE id=$1 RETURNING *", [row.id, hash]);
  return paid;
}

// The send failed: give the CR back in a second balanced ledger entry
// (game treasury -> player) so a failed payout never costs the player.
async function refundWithdrawal(db, row, error) {
  await transaction(db, async (c) => {
    await c.query('SELECT player_id FROM player_accounts WHERE player_id=$1 FOR UPDATE', [row.player_id]);
    await ledger(c, { playerId: row.player_id, key: `${row.idempotency_key}:refund`, kind: 'cr_withdrawal_refund', amount: BigInt(row.amount_cr), reference: row.id, from: ['game', 'main'], to: ['player', row.player_id], result: { withdrawalId: row.id, amountCr: Number(row.amount_cr), error: error.code || error.message || 'send_failed' } });
    await c.query('UPDATE game_treasury SET balance=balance-$2,version=version+1 WHERE id=$1', ['main', Number(row.amount_cr)]);
    await c.query('UPDATE player_accounts SET balance=balance+$2,version=version+1 WHERE player_id=$1', [row.player_id, Number(row.amount_cr)]);
  });
}

export async function listWithdrawals(db, playerId) {
  return (await db.query('SELECT * FROM cr_withdrawals WHERE player_id=$1 ORDER BY created_at DESC LIMIT 50', [playerId])).rows;
}
