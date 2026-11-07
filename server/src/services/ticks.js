import { randomUUID } from 'node:crypto';
import { logisticGrowth, nextPrice, isMerchantBankrupt } from '../domain/economy.js';
import { closeBankruptMerchant } from './market.js';
import { transaction } from './transaction.js';
import { config } from '../config/env.js';
import { agentTick } from './merchant-agent.js';

// Fixed unit bridge; the CR price itself stays dynamic (population, demand, stock). 1 CR = 0.0005 NEAR.
export const crToYocto = (cr) => BigInt(Math.round(Number(cr))) * 5n * 10n ** 20n;

export async function tick(db) {
  const result = await transaction(db, async c => {
    if (!(await c.query('SELECT pg_try_advisory_xact_lock(1945837212) AS locked')).rows[0].locked) return { skipped: true };
    // Same order as selling: merchant, market; population tick never waits for player.
    const merchants = (await c.query('SELECT * FROM merchant_accounts ORDER BY id FOR UPDATE')).rows;
    let grown = 0, prices = 0, orders = 0;
    for (const h of (await c.query('SELECT * FROM habitats ORDER BY id FOR UPDATE')).rows) {
      const populations = (await c.query(`SELECT p.*,floor(extract(epoch FROM clock_timestamp()-last_regenerated_at)*1000)::bigint elapsed
        FROM populations p WHERE habitat_id=$1 ORDER BY species_id FOR UPDATE`, [h.id])).rows;
      for (const p of populations) {
        if (Number(p.elapsed) < config.populationTickSeconds * 1000) continue;
        const next = logisticGrowth({ population: p.population_count, capacity: p.capacity, regenPerHourMilli: p.regen_per_hour_milli, remainderNano: Number(p.remainder_nano), elapsedMs: Math.max(0,Number(p.elapsed)), healthPpm: h.health_ppm });
        await c.query(`UPDATE populations SET population_count=$3,remainder_nano=$4,last_regenerated_at=clock_timestamp(),version=version+1 WHERE habitat_id=$1 AND species_id=$2`, [h.id,p.species_id,next.population,next.remainderNano]);
        const delta = next.population-p.population_count; grown += delta;
        if (delta) await c.query(`INSERT INTO population_events(id,habitat_id,species_id,event_type,delta,source_key) VALUES($1,$2,$3,'regeneration',$4,$5)`, [randomUUID(),h.id,p.species_id,delta,randomUUID()]);
      }
    }
    for (const m of merchants) {
      const due = (await c.query(`SELECT clock_timestamp()-tick_started_at >= $2 * interval '1 second' AS due FROM merchant_accounts WHERE id=$1`, [m.id,config.marketTickSeconds])).rows[0].due;
      if (!due) continue;
      await c.query('UPDATE merchant_accounts SET tick_spent=0,tick_started_at=clock_timestamp() WHERE id=$1', [m.id]);
      await c.query('DELETE FROM merchant_orders WHERE merchant_id=$1', [m.id]);
      if (m.enabled && isMerchantBankrupt({ availableBalance: Number(m.available_balance), reserveFloor: Number(m.reserve_floor) })) { await closeBankruptMerchant(c, m); continue; }
      if (!m.enabled) { await c.query("INSERT INTO merchant_audit(merchant_id,action,detail) VALUES($1,'disabled','{}')", [m.id]); continue; }
      let budget = Math.min(Number(m.max_tick),Math.max(0,Number(m.available_balance)-Number(m.reserve_floor)));
      const rows = (await c.query(`SELECT s.*,mi.quantity,md.desired_quantity,md.max_price,p.population_count,p.capacity,ms.current_price,ms.price_version,COALESCE(shop.listings,0) AS shop_listings
        FROM merchant_demand md JOIN species s ON s.id=md.species_id
        JOIN merchant_inventory mi ON mi.species_id=s.id AND mi.merchant_id=md.merchant_id
        JOIN populations p ON p.species_id=s.id AND p.habitat_id=s.habitat_id JOIN market_state ms ON ms.species_id=s.id
        LEFT JOIN (SELECT species_id,COUNT(*)::int AS listings FROM shop_listings WHERE status='active' GROUP BY species_id) shop ON shop.species_id=s.id
        WHERE md.merchant_id=$1 AND s.economic_enabled AND NOT s.protected ORDER BY s.id FOR UPDATE OF ms,mi`, [m.id])).rows;
      for (const s of rows) {
        const demand = Math.max(0,s.desired_quantity-s.quantity);
        // One market, one price signal (docs/MARKETPLACE_MOTHERSHIP.md): a fish
        // listed in a player shop is market supply exactly like a fish in the
        // merchant's inventory, so it pushes the price the same way. Merchant
        // demand is unchanged — a shop listing never satisfies it.
        const marketStock = s.quantity + Number(s.shop_listings);
        const next = nextPrice({ basePrice:Number(s.base_price),marketStock,targetStock:Math.max(1,s.desired_quantity),demand,population:s.population_count,capacity:s.capacity,previousPrice:Number(s.current_price) });
        const updated = (await c.query('UPDATE market_state SET stock=$2,demand=$3,current_price=$4,price_version=price_version+1,updated_at=clock_timestamp() WHERE species_id=$1 RETURNING price_version', [s.id,marketStock,demand,next.price])).rows[0]; prices++;
        const quantity = next.price <= Number(s.max_price) ? Math.min(demand,Math.floor(Math.min(budget,Number(m.max_order))/next.price)) : 0;
        if (quantity) {
          await c.query(`INSERT INTO merchant_orders(id,merchant_id,species_id,quantity,unit_price,price_version,expires_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+$7*interval '1 second')`, [randomUUID(),m.id,s.id,quantity,next.price,updated.price_version,config.marketTickSeconds*2]);
          budget -= quantity*next.price; orders++;
        }
        await c.query(`INSERT INTO merchant_audit(merchant_id,action,detail) VALUES($1,'tick',$2)`, [m.id,{ speciesId:s.id,quantity,price:next.price,reason:next.reason,remainingBudget:budget,shopListings:Number(s.shop_listings) }]);
      }
    }
    // Phase 2/4: collect what the agent must mirror. All chain work happens after COMMIT so an RPC
    // round-trip never holds these row locks.
    const wanted = (await c.query(`SELECT o.species_id,i.receipt_id,r.player_id,p.wallet_account,o.unit_price
      FROM merchant_orders o JOIN merchant_accounts m ON m.id=o.merchant_id AND m.enabled
      JOIN inventory_receipts i ON i.species_id=o.species_id AND i.sold_at IS NULL
      JOIN catch_receipts r ON r.id=i.receipt_id AND r.token_id IS NOT NULL
      JOIN players p ON p.id=r.player_id AND p.wallet_account IS NOT NULL
      WHERE o.quantity>0 AND o.expires_at>clock_timestamp()
      ORDER BY o.species_id LIMIT 25`)).rows;
    return { grown, prices, orders, wanted };
  });
  if (result.skipped || !result.wanted?.length) return result;
  const agent = await agentTick(result.wanted.map(w => ({
    species_id: w.species_id, token_id: `fish:${w.receipt_id}`, playerId: w.wallet_account,
    unitPrice: crToYocto(w.unit_price).toString()
  }))).catch(error => ({ error: error.code || 'agent_failed' }));
  return { ...result, wanted: undefined, agent };
}
