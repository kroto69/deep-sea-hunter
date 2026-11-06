import { randomUUID } from 'node:crypto';
import { requireActiveSession } from './sessions.js';
export const fail = (code, statusCode = 409) => { throw Object.assign(new Error(code), { code, statusCode }); };
export function key(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(value)) fail('invalid_idempotency_key', 400); return value; }
export async function transaction(db, fn) {
  const c = await db.connect();
  try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result; }
  catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
export async function playerTransaction(db, identity, idempotencyKey, fn) {
  key(idempotencyKey);
  return transaction(db, async c => {
    await requireActiveSession(c, identity);
    await c.query('SELECT player_id FROM player_accounts WHERE player_id=$1 FOR UPDATE', [identity.id]);
    await requireActiveSession(c, identity);
    const scoped = `${identity.id}:${idempotencyKey}`;
    if ((await c.query('SELECT id FROM economy_transactions WHERE idempotency_key=$1', [scoped])).rowCount) fail('idempotency_replay');
    return fn(c, scoped);
  });
}
export async function ledger(c, { playerId, key, kind, amount, reference, from, to, result = {} }) {
  const id = randomUUID();
  await c.query(`INSERT INTO economy_transactions(id,idempotency_key,player_id,kind,status,amount,reference_id,result)
    VALUES($1,$2,$3,$4,'committed',$5,$6,$7)`, [id,key,playerId,kind,amount.toString(),reference,result]);
  for (const [account, delta] of [[from,-BigInt(amount)], [to,BigInt(amount)]]) {
    await c.query('INSERT INTO ledger_entries(id,transaction_id,account_type,account_id,delta) VALUES($1,$2,$3,$4,$5)', [randomUUID(),id,account[0],account[1],delta.toString()]);
  }
  return id;
}
