import { randomUUID } from 'node:crypto';
import { fail, playerTransaction, ledger, transaction } from './transaction.js';
import { requireActiveSession } from './sessions.js';

export async function quote(db, identity, receiptId) {
  return transaction(db, async c => {
    await requireActiveSession(c, identity);
    const { rows } = await c.query(`SELECT r.id,o.merchant_id,o.unit_price,o.price_version FROM catch_receipts r
      JOIN inventory_receipts i ON i.receipt_id=r.id JOIN merchant_orders o ON o.species_id=r.species_id
      JOIN merchant_accounts m ON m.id=o.merchant_id JOIN market_state ms ON ms.species_id=r.species_id
      WHERE r.id=$1 AND r.player_id=$2 AND r.token_id IS NULL AND r.status='valid' AND r.expires_at>clock_timestamp() AND i.sold_at IS NULL
      AND m.enabled AND o.quantity>0 AND o.expires_at>clock_timestamp() AND o.price_version=ms.price_version ORDER BY o.merchant_id LIMIT 1`, [receiptId,identity.id]);
    if (!rows.length) fail('no_quote_available');
    const r = rows[0];
    return (await c.query(`INSERT INTO market_quotes(id,player_id,merchant_id,receipt_id,unit_price,price_version,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '30 seconds') RETURNING *`, [randomUUID(),identity.id,r.merchant_id,receiptId,r.unit_price,r.price_version])).rows[0];
  });
}

export async function sell(db, identity, quoteId, idempotencyKey) {
  return playerTransaction(db, identity, idempotencyKey, async (c, scoped) => {
    const q = (await c.query('SELECT * FROM market_quotes WHERE id=$1 AND player_id=$2 FOR UPDATE', [quoteId,identity.id])).rows[0];
    if (!q) fail('quote_not_found',404);
    const m = (await c.query('SELECT * FROM merchant_accounts WHERE id=$1 FOR UPDATE', [q.merchant_id])).rows[0];
    const r = (await c.query('SELECT * FROM catch_receipts WHERE id=$1 AND player_id=$2 FOR UPDATE', [q.receipt_id,identity.id])).rows[0];
    // Minted catch is sold on-chain only; selling it for CR too would pay twice for one fish.
    if (r?.token_id) fail('catch_minted_onchain');
    const price = (await c.query('SELECT * FROM market_state WHERE species_id=$1 FOR UPDATE', [r.species_id])).rows[0];
    const order = (await c.query('SELECT *,expires_at>clock_timestamp() active FROM merchant_orders WHERE merchant_id=$1 AND species_id=$2 FOR UPDATE', [m.id,r.species_id])).rows[0];
    const species = (await c.query('SELECT * FROM species WHERE id=$1 FOR SHARE', [r.species_id])).rows[0];
    await requireActiveSession(c,identity);
    const valid = (await c.query('SELECT expires_at>clock_timestamp() active FROM market_quotes WHERE id=$1', [q.id])).rows[0].active;
    if (q.settled_at || !valid) fail('quote_expired_or_used');
    if (r.status!=='valid' || !(await c.query('SELECT id FROM catch_receipts WHERE id=$1 AND expires_at>clock_timestamp()', [r.id])).rowCount) fail('receipt_unavailable');
    if (species.protected || !species.economic_enabled || !m.enabled) fail('merchant_disabled');
    if (!order || !(await c.query('SELECT id FROM merchant_orders WHERE id=$1 AND expires_at>clock_timestamp()',[order.id])).rowCount || order.quantity<1 || order.price_version!==q.price_version || price.price_version!==q.price_version || order.unit_price!==q.unit_price) fail('quote_stale');
    const amount=BigInt(q.unit_price);
    if (amount>BigInt(m.max_order) || BigInt(m.tick_spent)+amount>BigInt(m.max_tick) || BigInt(m.available_balance)-amount<BigInt(m.reserve_floor)) fail('merchant_budget_exhausted');
    if (!(await c.query('UPDATE inventory_receipts SET sold_at=clock_timestamp() WHERE receipt_id=$1 AND player_id=$2 AND sold_at IS NULL', [r.id,identity.id])).rowCount) fail('receipt_already_sold');
    if (!(await c.query('UPDATE player_inventory SET quantity=quantity-1,version=version+1 WHERE player_id=$1 AND species_id=$2 AND quantity>0', [identity.id,r.species_id])).rowCount) fail('inventory_empty');
    await c.query("UPDATE catch_receipts SET status='sold' WHERE id=$1", [r.id]);
    await c.query('UPDATE market_quotes SET settled_at=clock_timestamp() WHERE id=$1', [q.id]);
    await c.query('UPDATE merchant_accounts SET total_treasury=total_treasury-$2,available_balance=available_balance-$2,tick_spent=tick_spent+$2 WHERE id=$1', [m.id,amount.toString()]);
    await c.query('UPDATE merchant_orders SET quantity=quantity-1 WHERE id=$1', [order.id]);
    await c.query('UPDATE merchant_inventory SET quantity=quantity+1 WHERE merchant_id=$1 AND species_id=$2', [m.id,r.species_id]);
    await c.query('UPDATE market_state SET stock=stock+1,demand=GREATEST(0,demand-1) WHERE species_id=$1', [r.species_id]);
    const balance=(await c.query('UPDATE player_accounts SET balance=balance+$2,version=version+1 WHERE player_id=$1 RETURNING balance', [identity.id,amount.toString()])).rows[0].balance;
    const result={ receiptId:r.id,amount:amount.toString(),balance,settlement:'simulated_offchain' };
    const id=await ledger(c,{ playerId:identity.id,key:scoped,kind:'fish_sale',amount,reference:r.id,from:['merchant',m.id],to:['player',identity.id],result });
    await c.query(`INSERT INTO market_transactions(id,idempotency_key,player_id,merchant_id,receipt_id,species_id,unit_price,quote_version,economy_transaction_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$1)`, [id,scoped,identity.id,m.id,r.id,r.species_id,amount.toString(),q.price_version]);
    await c.query("INSERT INTO merchant_audit(merchant_id,action,detail) VALUES($1,'purchase',$2)",[m.id,{receiptId:r.id,transactionId:id,amount:amount.toString()}]);
    return {transactionId:id,...result};
  });
}
