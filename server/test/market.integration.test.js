import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase } from './database.js';
import { buildApp } from '../src/app.js';
import { tick } from '../src/services/ticks.js';
import { logisticGrowth } from '../src/domain/economy.js';

test('logistic population stays bounded, carries fractions, respects environment',()=>{
 const input={population:50,capacity:100,regenPerHourMilli:1000,elapsedMs:3600000};
 const n=logisticGrowth(input); assert.ok(n.population>=50&&n.population<=51); assert.ok(n.remainderNano>0);
 assert.equal(logisticGrowth({...input,healthPpm:0}).population,50);
 assert.equal(logisticGrowth({...input,population:0}).population,0);
 assert.equal(logisticGrowth({...input,population:100}).population,100);
});
test('economy HTTP transactions and deterministic worker', {skip:!process.env.TEST_DATABASE_URL},async t=>{
 const f=await testDatabase(),db=f.db,app=buildApp(db);t.after(async()=>{await app.close();await f.close();});
 const user=(await app.inject({method:'POST',url:'/api/sessions/guest'})).json();
 const req=(method,url,payload,key=randomUUID())=>app.inject({method,url,payload,headers:{authorization:`Bearer ${user.token}`,'idempotency-key':key}});
 const hunt=(await req('POST','/api/hunts',{habitatId:'coral'})).json();
 const receipts=[];
 for(let i=0;i<8;i++){
   await db.query("UPDATE player_equipment SET last_shot_at=clock_timestamp()-interval '2 seconds' WHERE player_id=$1",[user.player.id]);
   const r=await req('POST',`/api/hunts/${hunt.id}/shots`,{shotId:randomUUID(),speciesId:'clownfish'});assert.equal(r.statusCode,201,r.body);receipts.push(r.json().receipt.id);
 }
 await db.query("UPDATE market_state ms SET current_price=s.base_price,price_version=1 FROM species s WHERE ms.species_id=s.id");
 await db.query("UPDATE merchant_accounts SET tick_started_at=clock_timestamp()-interval '2 minutes'");
 const tickResult=await tick(db);assert.ok(tickResult.orders>0);
 // Fixture gives sales deterministic budget after market tick iterates species by ID.
 await db.query(`INSERT INTO merchant_orders(id,merchant_id,species_id,quantity,unit_price,price_version,expires_at)
   SELECT gen_random_uuid(),d.merchant_id,d.species_id,LEAST(d.desired_quantity,10),s.base_price,ms.price_version,clock_timestamp()+interval '10 minutes'
   FROM merchant_demand d JOIN species s ON s.id=d.species_id JOIN market_state ms ON ms.species_id=s.id
   WHERE d.merchant_id='dock-merchant' AND d.species_id='clownfish'
   ON CONFLICT(merchant_id,species_id) DO UPDATE SET quantity=EXCLUDED.quantity,unit_price=EXCLUDED.unit_price,price_version=EXCLUDED.price_version,expires_at=EXCLUDED.expires_at`);
 await t.test('merchant opens bounded orders and keeps three balances separate',async()=>{
   const market=(await req('GET','/api/market')).json(), orders=(await req('GET','/api/market/orders')).json();
   assert.equal(market.merchant.length,1);
   assert.equal(market.merchant[0].total_treasury,'10000');
   assert.ok(orders.some(o=>o.status==='open'&&o.quantity>0&&o.needed>0));
   const order=orders.find(o=>o.species_id==='clownfish');
   assert.ok(order.quantity*Number(order.unit_price)<=Number(market.merchant[0].max_tick));
   const before=(await db.query(`SELECT (SELECT balance FROM player_accounts WHERE player_id=$1) player,
     (SELECT total_treasury FROM merchant_accounts WHERE id='dock-merchant') merchant,
     (SELECT balance FROM game_treasury WHERE id='main') game`,[user.player.id])).rows[0];
   const q=(await req('GET',`/api/market/quotes?receiptId=${receipts[0]}`)).json();
   const sold=await req('POST','/api/market/sell',{quoteId:q.id});assert.equal(sold.statusCode,200,sold.body);
   const after=(await db.query(`SELECT (SELECT balance FROM player_accounts WHERE player_id=$1) player,
     (SELECT total_treasury FROM merchant_accounts WHERE id='dock-merchant') merchant,
     (SELECT balance FROM game_treasury WHERE id='main') game`,[user.player.id])).rows[0];
   assert.equal(BigInt(after.player)-BigInt(before.player),BigInt(sold.json().amount));
   assert.equal(BigInt(before.merchant)-BigInt(after.merchant),BigInt(sold.json().amount));
   assert.equal(after.game,before.game);
   assert.equal((await db.query("SELECT quantity FROM merchant_inventory WHERE merchant_id='dock-merchant' AND species_id='clownfish'")).rows[0].quantity,1);
   assert.equal((await db.query("SELECT count(*)::int n FROM merchant_audit WHERE merchant_id='dock-merchant' AND action='purchase'")).rows[0].n,1);
   const purchases=(await req('GET','/api/market/purchases')).json();
   assert.equal(purchases.length,1);assert.equal(purchases[0].species_id,'clownfish');
   assert.equal('player_id' in purchases[0],false);
   assert.equal((await db.query("SELECT count(*)::int n FROM ledger_entries WHERE account_type='merchant' AND delta=$1",[-BigInt(sold.json().amount).toString()])).rows[0].n,1);
   assert.equal((await req('GET','/api/market/orders')).json().find(o=>o.species_id==='clownfish').quantity,order.quantity-1);
   assert.equal((await req('POST','/api/market/sell',{quoteId:q.id})).statusCode,409);
   assert.equal((await req('GET',`/api/market/quotes?receiptId=${receipts[0]}`)).statusCode,409);
   assert.equal((await db.query('SELECT sum(delta)::text total FROM ledger_entries')).rows[0].total,'0');
 });
 await t.test('quotes and concurrent sales credit exactly once',async()=>{
   const q=(await req('GET',`/api/market/quotes?receiptId=${receipts[1]}`)).json();
   const results=await Promise.all([req('POST','/api/market/sell',{quoteId:q.id}),req('POST','/api/market/sell',{quoteId:q.id})]);
   assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
   assert.equal((await db.query('SELECT count(*)::int n FROM market_transactions')).rows[0].n,2);
   assert.equal((await db.query('SELECT sum(delta)::text total FROM ledger_entries')).rows[0].total,'0');
   assert.equal((await db.query('SELECT quantity FROM player_inventory WHERE player_id=$1',[user.player.id])).rows[0].quantity,6);
 });
 await t.test('settlement rollback on late ledger failure',async()=>{
   const q=(await req('GET',`/api/market/quotes?receiptId=${receipts[2]}`)).json();
   const before=(await db.query('SELECT balance FROM player_accounts WHERE player_id=$1',[user.player.id])).rows[0].balance;
   await db.query(`CREATE FUNCTION fail_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected ledger failure'; END $$;CREATE TRIGGER fail_ledger BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION fail_ledger()`);
   try {assert.equal((await req('POST','/api/market/sell',{quoteId:q.id})).statusCode,500);assert.equal((await db.query('SELECT balance FROM player_accounts WHERE player_id=$1',[user.player.id])).rows[0].balance,before);assert.equal((await db.query('SELECT status FROM catch_receipts WHERE id=$1',[receipts[2]])).rows[0].status,'valid');}
   finally {await db.query('DROP TRIGGER fail_ledger ON ledger_entries;DROP FUNCTION fail_ledger()');}
 });
 await t.test('inventory, treasury and order limits reject without partial settlement',async()=>{
   const receipt=receipts[3], quote=()=>req('GET',`/api/market/quotes?receiptId=${receipt}`);
   const before=(await db.query(`SELECT (SELECT balance FROM player_accounts WHERE player_id=$1) player,
     (SELECT total_treasury FROM merchant_accounts WHERE id='dock-merchant') merchant,
     (SELECT balance FROM game_treasury WHERE id='main') game,
     (SELECT count(*)::int FROM market_transactions) sales`,[user.player.id])).rows[0];
   const q=(await quote()).json();
   const orderQuantity=(await db.query("SELECT quantity FROM merchant_orders WHERE species_id='clownfish'")).rows[0].quantity;
   await db.query('UPDATE player_inventory SET quantity=0 WHERE player_id=$1 AND species_id=$2',[user.player.id,'clownfish']);
   const empty=await req('POST','/api/market/sell',{quoteId:q.id});assert.equal(empty.statusCode,409,empty.body);assert.equal(empty.json().error,'inventory_empty');
   await db.query('UPDATE player_inventory SET quantity=6 WHERE player_id=$1 AND species_id=$2',[user.player.id,'clownfish']);
   await db.query("UPDATE merchant_accounts SET total_treasury=reserve_floor,available_balance=reserve_floor WHERE id='dock-merchant'");
   const poor=await req('POST','/api/market/sell',{quoteId:q.id});assert.equal(poor.statusCode,409,poor.body);assert.equal(poor.json().error,'merchant_budget_exhausted');
   await db.query("UPDATE merchant_accounts SET total_treasury=$1,available_balance=$1 WHERE id='dock-merchant'",[before.merchant]);
   await db.query("UPDATE merchant_orders SET quantity=0 WHERE species_id='clownfish'");
   assert.equal((await quote()).statusCode,409);
   const spent=await req('POST','/api/market/sell',{quoteId:q.id});assert.equal(spent.statusCode,409,spent.body);
   await db.query("UPDATE merchant_orders SET quantity=$1 WHERE species_id='clownfish'",[orderQuantity]);
   const after=(await db.query(`SELECT (SELECT balance FROM player_accounts WHERE player_id=$1) player,
     (SELECT total_treasury FROM merchant_accounts WHERE id='dock-merchant') merchant,
     (SELECT balance FROM game_treasury WHERE id='main') game,
     (SELECT count(*)::int FROM market_transactions) sales`,[user.player.id])).rows[0];
   assert.deepEqual(after,before);
   assert.equal((await db.query('SELECT status FROM catch_receipts WHERE id=$1',[receipt])).rows[0].status,'valid');
 });
 await t.test('sales fund upgrade, reward and consistent ledger',async()=>{
   for(const receipt of receipts.slice(2)){const q=(await req('GET',`/api/market/quotes?receiptId=${receipt}`)).json();const sold=await req('POST','/api/market/sell',{quoteId:q.id});assert.equal(sold.statusCode,200,sold.body);}
   const u=await req('POST','/api/player/equipment/upgrade',{});assert.equal(u.statusCode,200,u.body);assert.equal(u.json().speargunLevel,2);
   const claimed=await req('POST','/api/player/missions/catch5/claim',{});assert.equal(claimed.statusCode,200,claimed.body);
   assert.equal((await req('POST','/api/player/missions/catch5/claim',{})).statusCode,409);
   const balances=(await db.query(`SELECT (SELECT balance FROM player_accounts WHERE player_id=$1)+(SELECT balance FROM game_treasury WHERE id='main')+(SELECT total_treasury FROM merchant_accounts WHERE id='dock-merchant') AS total`,[user.player.id])).rows[0];assert.equal(balances.total,'10000');
   assert.equal((await db.query('SELECT transaction_id FROM ledger_entries GROUP BY transaction_id HAVING sum(delta)<>0')).rowCount,0);
 });
 await t.test('database rejects unbalanced transactions',async()=>{
   await assert.rejects(db.query(`INSERT INTO economy_transactions(id,idempotency_key,player_id,kind,status,amount) VALUES($1,$2,$3,'fish_sale','committed',1)`,[randomUUID(),randomUUID(),user.player.id]),e=>e.code==='23514');
 });
 await t.test('conservation policy, replay and mission reward',async()=>{
   await db.query(`INSERT INTO conservation_subjects VALUES('turtle-coral','coral','turtle',TRUE,FALSE),('manta-coral','coral','manta',TRUE,FALSE),('turtle-net-coral','coral','turtle',TRUE,TRUE)`);
   assert.equal((await req('POST','/api/conservation/events',{subjectId:'manta-coral',activity:'release'})).statusCode,409);
   for(const subject of ['turtle-coral','manta-coral']){await db.query("UPDATE conservation_events SET created_at=clock_timestamp()-interval '3 seconds'");assert.equal((await req('POST','/api/conservation/events',{subjectId:subject,activity:'observe'})).statusCode,200);}
   assert.equal((await req('POST','/api/conservation/events',{subjectId:'manta-coral',activity:'observe'})).statusCode,409);
   assert.equal((await req('POST','/api/player/missions/observe2/claim',{})).statusCode,200);
 });
 await t.test('population persisted fractional regeneration and merchant kill switch',async()=>{
   await db.query("UPDATE populations SET last_regenerated_at=clock_timestamp()-interval '1 hour'");await tick(db);
   assert.ok((await db.query('SELECT remainder_nano FROM populations WHERE remainder_nano>0')).rowCount>0);
   await db.query("UPDATE merchant_accounts SET enabled=FALSE,tick_started_at=clock_timestamp()-interval '2 minutes'");await tick(db);
   assert.equal((await db.query('SELECT * FROM merchant_orders')).rowCount,0);
 });
});
