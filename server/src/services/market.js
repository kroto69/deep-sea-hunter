import { randomUUID } from 'node:crypto';
import { fail, playerTransaction, ledger, transaction } from './transaction.js';
import { requireActiveSession } from './sessions.js';
import { isMerchantBankrupt, reopenAmountNeeded, SHOP_LICENSE_PRICE_CR } from '../domain/economy.js';

// Close a broke merchant: shop stops buying (quote/sell/tick/orders all gate on
// enabled), bankrupt_at records why it closed. Callers hold the merchant row lock.
export async function closeBankruptMerchant(c, m) {
  await c.query("UPDATE merchant_accounts SET enabled=FALSE,bankrupt_at=clock_timestamp() WHERE id=$1", [m.id]);
  await c.query("INSERT INTO merchant_audit(merchant_id,action,detail) VALUES($1,'bankrupt',$2)", [m.id, { availableBalance: Number(m.available_balance), reserveFloor: Number(m.reserve_floor) }]);
}

export async function invest(db, identity, merchantId, amount, idempotencyKey) {
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000_000) fail('invalid_investment_amount', 400);
  return playerTransaction(db, identity, idempotencyKey, async (c, scoped) => {
    const m = (await c.query('SELECT * FROM merchant_accounts WHERE id=$1 FOR UPDATE', [merchantId])).rows[0];
    if (!m) fail('merchant_not_found', 404);
    if (!m.bankrupt_at) fail(m.enabled ? 'merchant_not_bankrupt' : 'merchant_closed');
    const needed = reopenAmountNeeded({ availableBalance: Number(m.available_balance), reserveFloor: Number(m.reserve_floor) });
    if (amount < needed) fail('investment_below_reopen_amount');
    const balance = (await c.query('UPDATE player_accounts SET balance=balance-$2,version=version+1 WHERE player_id=$1 AND balance >= $2 RETURNING balance', [identity.id, amount])).rows[0]?.balance;
    if (balance === undefined) fail('insufficient_credits');
    const updated = (await c.query('UPDATE merchant_accounts SET total_treasury=total_treasury+$2,available_balance=available_balance+$2,invested_total=invested_total+$2,enabled=TRUE,bankrupt_at=NULL WHERE id=$1 RETURNING total_treasury,available_balance', [m.id, amount])).rows[0];
    const id = await ledger(c, { playerId: identity.id, key: scoped, kind: 'merchant_investment', amount: BigInt(amount), reference: m.id, from: ['player', identity.id], to: ['merchant', m.id], result: { merchantId: m.id, reopened: true, needed } });
    await c.query("INSERT INTO merchant_audit(merchant_id,action,detail) VALUES($1,'invest',$2)", [m.id, { playerId: identity.id, transactionId: id, amount, needed }]);
    await c.query("INSERT INTO merchant_audit(merchant_id,action,detail) VALUES($1,'reopened',$2)", [m.id, { playerId: identity.id, transactionId: id, availableBalance: Number(updated.available_balance) }]);
    return { transactionId: id, merchantId: m.id, amount: amount.toString(), needed: needed.toString(), playerBalance: balance, merchantAvailable: updated.available_balance, reopened: true, settlement: 'simulated_offchain' };
  });
}

export async function quote(db, identity, receiptId) {
  return transaction(db, async c => {
    await requireActiveSession(c, identity);
    const { rows } = await c.query(`SELECT r.id,o.merchant_id,o.unit_price,o.price_version FROM catch_receipts r
      JOIN inventory_receipts i ON i.receipt_id=r.id JOIN merchant_orders o ON o.species_id=r.species_id
      JOIN merchant_accounts m ON m.id=o.merchant_id JOIN market_state ms ON ms.species_id=r.species_id
      WHERE r.id=$1 AND r.player_id=$2 AND r.status='valid' AND r.expires_at>clock_timestamp() AND i.sold_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM shop_listings sl WHERE sl.receipt_id=r.id AND sl.status='active')
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
    const price = (await c.query('SELECT * FROM market_state WHERE species_id=$1 FOR UPDATE', [r.species_id])).rows[0];
    const order = (await c.query('SELECT *,expires_at>clock_timestamp() active FROM merchant_orders WHERE merchant_id=$1 AND species_id=$2 FOR UPDATE', [m.id,r.species_id])).rows[0];
    const species = (await c.query('SELECT * FROM species WHERE id=$1 FOR SHARE', [r.species_id])).rows[0];
    await requireActiveSession(c,identity);
    const valid = (await c.query('SELECT expires_at>clock_timestamp() active FROM market_quotes WHERE id=$1', [q.id])).rows[0].active;
    if (q.settled_at || !valid) fail('quote_expired_or_used');
    if (r.status!=='valid' || !(await c.query('SELECT id FROM catch_receipts WHERE id=$1 AND expires_at>clock_timestamp()', [r.id])).rowCount) fail('receipt_unavailable');
    // Escrow: a receipt listed in a player shop cannot be sold to the
    // merchant, even if the quote was issued before the listing went up.
    if ((await c.query("SELECT 1 FROM shop_listings WHERE receipt_id=$1 AND status='active'", [r.id])).rowCount) fail('receipt_listed');
    if (species.protected || !species.economic_enabled || !m.enabled) fail('merchant_disabled');
    if (!order || !(await c.query('SELECT id FROM merchant_orders WHERE id=$1 AND expires_at>clock_timestamp()',[order.id])).rowCount || order.quantity<1 || order.price_version!==q.price_version || price.price_version!==q.price_version || order.unit_price!==q.unit_price) fail('quote_stale');
    const amount=BigInt(q.unit_price);
    if (amount>BigInt(m.max_order) || BigInt(m.tick_spent)+amount>BigInt(m.max_tick) || BigInt(m.available_balance)-amount<BigInt(m.reserve_floor)) fail('merchant_budget_exhausted');
    if (!(await c.query('UPDATE inventory_receipts SET sold_at=clock_timestamp() WHERE receipt_id=$1 AND player_id=$2 AND sold_at IS NULL', [r.id,identity.id])).rowCount) fail('receipt_already_sold');
    if (!(await c.query('UPDATE player_inventory SET quantity=quantity-1,version=version+1 WHERE player_id=$1 AND species_id=$2 AND quantity>0', [identity.id,r.species_id])).rowCount) fail('inventory_empty');
    await c.query("UPDATE catch_receipts SET status='sold' WHERE id=$1", [r.id]);
    await c.query('UPDATE market_quotes SET settled_at=clock_timestamp() WHERE id=$1', [q.id]);
    await c.query('UPDATE merchant_accounts SET total_treasury=total_treasury-$2,available_balance=available_balance-$2,tick_spent=tick_spent+$2 WHERE id=$1', [m.id,amount.toString()]);
    const availableAfter = Number(m.available_balance) - Number(amount);
    if (isMerchantBankrupt({ availableBalance: availableAfter, reserveFloor: Number(m.reserve_floor) })) await closeBankruptMerchant(c, { ...m, available_balance: availableAfter });
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

// ---------------------------------------------------------------------------
// Mothership marketplace, slice 1 (docs/MARKETPLACE_MOTHERSHIP.md).
// A licensed player lists caught fish at their own price; another player
// buys with CR. Listed receipts are escrowed from the merchant (see the
// NOT EXISTS guard in quote() and the receipt_listed guard in sell()).
// ---------------------------------------------------------------------------

// Buy the one-time shop license (boat stall) with CR. The CR sinks into the
// game treasury; the license never expires and cannot be resold in this slice.
export async function buyLicense(db, identity, idempotencyKey) {
  return playerTransaction(db, identity, idempotencyKey, async (c, scoped) => {
    const existing = (await c.query('SELECT player_id FROM shop_licenses WHERE player_id=$1 FOR UPDATE', [identity.id])).rows[0];
    if (existing?.active) fail('shop_license_exists');
    const price = SHOP_LICENSE_PRICE_CR;
    const balance = (await c.query('UPDATE player_accounts SET balance=balance-$2,version=version+1 WHERE player_id=$1 AND balance>=$2 RETURNING balance', [identity.id, price])).rows[0]?.balance;
    if (balance === undefined) fail('insufficient_credits');
    const id = await ledger(c, { playerId: identity.id, key: scoped, kind: 'shop_license', amount: BigInt(price), reference: 'mothership', from: ['player', identity.id], to: ['game', 'main'], result: { tier: 'boat', price } });
    await c.query('UPDATE game_treasury SET balance=balance+$2,version=version+1 WHERE id=$1', ['main', price]);
    await c.query('INSERT INTO shop_licenses(player_id,tier,price_paid,transaction_id) VALUES($1,$2,$3,$4) ON CONFLICT(player_id) DO UPDATE SET active=TRUE,price_paid=EXCLUDED.price_paid,transaction_id=EXCLUDED.transaction_id,acquired_at=clock_timestamp()', [identity.id, 'boat', price, id]);
    return { transactionId: id, tier: 'boat', price, playerBalance: balance, settlement: 'simulated_offchain' };
  });
}

// List one caught fish in the player's shop at the seller's own price.
export async function listFish(db, identity, receiptId, price, idempotencyKey) {
  if (!Number.isSafeInteger(price) || price < 1 || price > 1_000_000_000) fail('invalid_listing_price', 400);
  return playerTransaction(db, identity, idempotencyKey, async (c, scoped) => {
    const license = (await c.query('SELECT player_id FROM shop_licenses WHERE player_id=$1 AND active FOR UPDATE', [identity.id])).rows[0];
    if (!license) fail('shop_license_required');
    const r = (await c.query('SELECT * FROM catch_receipts WHERE id=$1 AND player_id=$2 FOR UPDATE', [receiptId, identity.id])).rows[0];
    if (!r || r.status !== 'valid' || !(await c.query('SELECT id FROM catch_receipts WHERE id=$1 AND expires_at>clock_timestamp()', [r.id])).rowCount) fail('receipt_unavailable');
    if (!(await c.query('SELECT receipt_id FROM inventory_receipts WHERE receipt_id=$1 AND player_id=$2 AND sold_at IS NULL', [r.id, identity.id])).rowCount) fail('receipt_unavailable');
    if ((await c.query("SELECT id FROM shop_listings WHERE receipt_id=$1 AND status='active'", [r.id])).rowCount) fail('receipt_already_listed');
    const listing = (await c.query("INSERT INTO shop_listings(id,seller_id,receipt_id,species_id,price) VALUES($1,$2,$3,$4,$5) RETURNING *", [randomUUID(), identity.id, r.id, r.species_id, price])).rows[0];
    return { listingId: listing.id, receiptId: r.id, speciesId: r.species_id, price, status: 'active' };
  });
}

// Take a listing off the market. The fish becomes an ordinary receipt again
// (quotable and sellable to the merchant). No money moves.
export async function delistFish(db, identity, listingId, idempotencyKey) {
  return playerTransaction(db, identity, idempotencyKey, async (c, scoped) => {
    const listing = (await c.query('SELECT * FROM shop_listings WHERE id=$1 AND seller_id=$2 FOR UPDATE', [listingId, identity.id])).rows[0];
    if (!listing) fail('listing_not_found', 404);
    if (listing.status !== 'active') fail('listing_not_active');
    await c.query("UPDATE shop_listings SET status='delisted' WHERE id=$1", [listing.id]);
    return { listingId: listing.id, receiptId: listing.receipt_id, speciesId: listing.species_id, status: 'delisted' };
  });
}

// Buy a fish from another player's shop. One atomic transaction: the buyer
// pays the seller in CR, the receipt and its inventory row move to the buyer,
// and the seller's species quantity drops by one while the buyer's rises.
export async function buyFromShop(db, identity, listingId, idempotencyKey) {
  return playerTransaction(db, identity, idempotencyKey, async (c, scoped) => {
    const listing = (await c.query('SELECT * FROM shop_listings WHERE id=$1 FOR UPDATE', [listingId])).rows[0];
    if (!listing) fail('listing_not_found', 404);
    if (listing.status !== 'active') fail('listing_not_active');
    if (listing.seller_id === identity.id) fail('cannot_buy_own_listing');
    const price = BigInt(listing.price);
    const r = (await c.query('SELECT * FROM catch_receipts WHERE id=$1 AND player_id=$2 FOR UPDATE', [listing.receipt_id, listing.seller_id])).rows[0];
    if (!r || r.status !== 'valid' || !(await c.query('SELECT id FROM catch_receipts WHERE id=$1 AND expires_at>clock_timestamp()', [r.id])).rowCount) fail('receipt_unavailable');
    if (!(await c.query('SELECT receipt_id FROM inventory_receipts WHERE receipt_id=$1 AND player_id=$2 AND sold_at IS NULL FOR UPDATE', [r.id, listing.seller_id])).rowCount) fail('receipt_unavailable');
    const buyerBalance = (await c.query('UPDATE player_accounts SET balance=balance-$2,version=version+1 WHERE player_id=$1 AND balance>=$2 RETURNING balance', [identity.id, listing.price])).rows[0]?.balance;
    if (buyerBalance === undefined) fail('insufficient_credits');
    const sellerBalance = (await c.query('UPDATE player_accounts SET balance=balance+$2,version=version+1 WHERE player_id=$1 RETURNING balance', [listing.seller_id, listing.price])).rows[0].balance;
    await c.query('UPDATE catch_receipts SET player_id=$2 WHERE id=$1', [r.id, identity.id]);
    await c.query('UPDATE inventory_receipts SET player_id=$2 WHERE receipt_id=$1 AND sold_at IS NULL', [r.id, identity.id]);
    if (!(await c.query('UPDATE player_inventory SET quantity=quantity-1,version=version+1 WHERE player_id=$1 AND species_id=$2 AND quantity>0', [listing.seller_id, listing.species_id])).rowCount) fail('inventory_empty');
    await c.query('INSERT INTO player_inventory(player_id,species_id,quantity) VALUES($1,$2,1) ON CONFLICT(player_id,species_id) DO UPDATE SET quantity=player_inventory.quantity+1,version=player_inventory.version+1', [identity.id, listing.species_id]);
    const result = { listingId: listing.id, receiptId: r.id, speciesId: listing.species_id, price: listing.price, sellerId: listing.seller_id, buyerBalance, sellerBalance, settlement: 'simulated_offchain' };
    const id = await ledger(c, { playerId: identity.id, key: scoped, kind: 'shop_sale', amount: price, reference: listing.id, from: ['player', identity.id], to: ['player', listing.seller_id], result });
    await c.query("UPDATE shop_listings SET status='sold',buyer_id=$2,transaction_id=$3,sold_at=clock_timestamp() WHERE id=$1", [listing.id, identity.id, id]);
    return { transactionId: id, ...result };
  });
}

// Read-only: my license (if any), active listings on the market, my listings.
export async function listShops(db, playerId) {
  return transaction(db, async c => {
    const license = (await c.query('SELECT player_id,tier,price_paid,acquired_at,active FROM shop_licenses WHERE player_id=$1', [playerId])).rows[0] || null;
    const listings = (await c.query(`SELECT l.*,s.name AS species_name FROM shop_listings l JOIN species s ON s.id=l.species_id WHERE l.status='active' ORDER BY l.created_at DESC LIMIT 100`)).rows;
    const myListings = (await c.query(`SELECT l.*,s.name AS species_name FROM shop_listings l JOIN species s ON s.id=l.species_id WHERE l.seller_id=$1 AND l.status='active' ORDER BY l.created_at DESC`, [playerId])).rows;
    return { license, listings, myListings };
  });
}
