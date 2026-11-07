import { quote, sell, invest, buyLicense, listFish, delistFish, buyFromShop, listShops } from '../services/market.js';
import { missions, upgrade, claim, unlockZone, conservation } from '../services/player.js';
const uuid={type:'string',format:'uuid'};
const slug={type:'string',pattern:'^[a-z0-9_-]{1,80}$'};
const body=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
export async function economyRoutes(app) {
  const auth={preHandler:app.requireSession};
  const post=(path,properties,fn)=>app.post(path,{...auth,schema:{body:body(properties)}},fn);
  const id=r=>r.player.id, key=r=>r.headers['idempotency-key'];
  app.get('/api/player',auth,async r=>(await app.pg.query(`SELECT p.id,p.mode,p.wallet_account,a.balance,e.speargun_level FROM players p JOIN player_accounts a ON a.player_id=p.id JOIN player_equipment e ON e.player_id=p.id WHERE p.id=$1`,[id(r)])).rows[0]);
  app.get('/api/player/inventory',auth,async r=>({items:(await app.pg.query(`SELECT i.*,s.name FROM player_inventory i JOIN species s ON s.id=i.species_id WHERE player_id=$1 ORDER BY species_id`,[id(r)])).rows,receipts:(await app.pg.query(`SELECT r.*,i.sold_at FROM catch_receipts r JOIN inventory_receipts i ON i.receipt_id=r.id WHERE r.player_id=$1 ORDER BY r.created_at DESC LIMIT 200`,[id(r)])).rows}));
  app.get('/api/player/equipment',auth,async r=>({...(await app.pg.query('SELECT speargun_level FROM player_equipment WHERE player_id=$1',[id(r)])).rows[0],upgradeCosts:{2:100,3:300}}));
  post('/api/player/equipment/upgrade',{},r=>upgrade(app.pg,r.player,key(r)));
  app.get('/api/player/missions',auth,r=>missions(app.pg,id(r)));
  app.post('/api/player/missions/:id/claim',{...auth,schema:{params:body({id:slug}),body:body({})}},r=>claim(app.pg,r.player,r.params.id,key(r)));
  app.get('/api/player/zones',auth,async r=>(await app.pg.query(`SELECT z.*,z.id='reef' OR p.zone_id IS NOT NULL AS unlocked FROM zone_definitions z LEFT JOIN player_zones p ON p.zone_id=z.id AND p.player_id=$1 ORDER BY cost`,[id(r)])).rows);
  post('/api/player/zones/unlock',{zoneId:slug},r=>unlockZone(app.pg,r.player,r.body.zoneId,key(r)));
  app.get('/api/market',auth,async()=>({settlement:'simulated_offchain',prices:(await app.pg.query('SELECT m.*,s.name FROM market_state m JOIN species s ON s.id=m.species_id ORDER BY species_id')).rows,merchant:(await app.pg.query('SELECT id,enabled,total_treasury,available_balance,reserved_balance,reserve_floor,max_order,max_tick,tick_spent,bankrupt_at,invested_total FROM merchant_accounts ORDER BY id')).rows}));
  app.get('/api/market/quotes',{...auth,schema:{querystring:body({receiptId:uuid})}},r=>quote(app.pg,r.player,r.query.receiptId));
  post('/api/market/sell',{quoteId:uuid},r=>sell(app.pg,r.player,r.body.quoteId,key(r)));
  post('/api/market/invest',{merchantId:slug,amount:{type:'integer',minimum:1,maximum:1000000000}},r=>invest(app.pg,r.player,r.body.merchantId,r.body.amount,key(r)));
  app.get('/api/market/shops',auth,async r=>listShops(app.pg,id(r)));
  post('/api/market/shops/license',{},r=>buyLicense(app.pg,r.player,key(r)));
  post('/api/market/shops/list',{receiptId:uuid,price:{type:'integer',minimum:1,maximum:1000000000}},r=>listFish(app.pg,r.player,r.body.receiptId,r.body.price,key(r)));
  post('/api/market/shops/delist',{listingId:uuid},r=>delistFish(app.pg,r.player,r.body.listingId,key(r)));
  post('/api/market/shops/buy',{listingId:uuid},r=>buyFromShop(app.pg,r.player,r.body.listingId,key(r)));
  app.get('/api/market/orders',auth,async()=>(await app.pg.query(`SELECT d.species_id,s.name,s.base_price,p.population_count,p.capacity,d.desired_quantity,i.quantity AS stock,
    (SELECT a.detail->>'reason' FROM merchant_audit a WHERE a.merchant_id=m.id AND a.action='tick' AND a.detail->>'speciesId'=s.id ORDER BY a.created_at DESC LIMIT 1) AS price_reason,
    GREATEST(0,d.desired_quantity-i.quantity) AS needed,o.id AS order_id,
    CASE WHEN m.enabled AND o.quantity>0 AND o.expires_at>clock_timestamp() THEN o.quantity ELSE 0 END AS quantity,
    CASE WHEN m.enabled AND o.quantity>0 AND o.expires_at>clock_timestamp() THEN o.unit_price ELSE NULL END AS unit_price,
    CASE WHEN m.bankrupt_at IS NOT NULL THEN 'bankrupt' WHEN NOT m.enabled THEN 'paused' WHEN i.quantity>=d.desired_quantity THEN 'fulfilled'
      WHEN o.quantity>0 AND o.expires_at>clock_timestamp() THEN 'open' ELSE 'waiting' END AS status
    FROM merchant_demand d JOIN merchant_accounts m ON m.id=d.merchant_id
    JOIN merchant_inventory i ON i.merchant_id=d.merchant_id AND i.species_id=d.species_id
    JOIN species s ON s.id=d.species_id JOIN populations p ON p.species_id=s.id AND p.habitat_id=s.habitat_id LEFT JOIN merchant_orders o ON o.merchant_id=d.merchant_id AND o.species_id=d.species_id
    WHERE s.economic_enabled AND NOT s.protected ORDER BY d.species_id`)).rows);
  app.get('/api/market/transactions',auth,async r=>(await app.pg.query('SELECT * FROM economy_transactions WHERE player_id=$1 ORDER BY created_at DESC LIMIT 100',[id(r)])).rows);
  app.get('/api/market/purchases',auth,async()=>(await app.pg.query(`SELECT t.species_id,s.name,t.unit_price,t.created_at FROM market_transactions t
    JOIN species s ON s.id=t.species_id ORDER BY t.created_at DESC,t.id DESC LIMIT 20`)).rows);
  app.get('/api/player/ledger',auth,async r=>(await app.pg.query(`SELECT l.*,t.kind,t.reference_id,CASE WHEN delta<0 THEN -delta ELSE 0 END AS debit,CASE WHEN delta>0 THEN delta ELSE 0 END AS credit FROM ledger_entries l JOIN economy_transactions t ON t.id=l.transaction_id WHERE l.account_type='player' AND l.account_id=$1 ORDER BY l.created_at DESC LIMIT 100`,[id(r)])).rows);
  app.get('/api/populations',auth,async()=>(await app.pg.query('SELECT p.*,h.health_ppm FROM populations p JOIN habitats h ON h.id=p.habitat_id ORDER BY habitat_id,species_id')).rows);
  app.get('/api/conservation/subjects',auth,async()=>(await app.pg.query('SELECT * FROM conservation_subjects ORDER BY id')).rows);
  post('/api/conservation/events',{subjectId:slug,activity:{type:'string',enum:['observe','photo','release']}},r=>conservation(app.pg,r.player,r.body,key(r)));
  app.get('/api/conservation/events',auth,async r=>(await app.pg.query('SELECT * FROM conservation_events WHERE player_id=$1 ORDER BY created_at DESC LIMIT 100',[id(r)])).rows);
}
