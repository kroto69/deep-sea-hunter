import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { testDatabase } from './database.js';
import { validateShot } from '../src/services/hunts.js';

test('shot validation rejects forged server fields and malformed identifiers', () => {
  assert.throws(() => validateShot({ shotId: 'validshot', speciesId: 'clownfish', price: 99 }, 'validkey'), /invalid_body/);
  assert.throws(() => validateShot({ shotId: 'x', speciesId: 'clownfish' }, 'validkey'), /invalid_shot_id/);
  assert.throws(() => validateShot({ shotId: 'validshot', speciesId: 'clownfish' }), /invalid_idempotency_key/);
});

test('hunting HTTP and PostgreSQL invariants', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const fixture = await testDatabase();
  const db = fixture.db, app = buildApp(db);
  t.after(async () => { await app.close(); await fixture.close(); });
  const guest = async () => { const r = await app.inject({ method: 'POST', url: '/api/sessions/guest' }); assert.equal(r.statusCode, 201); return r.json(); };
  const req = async (user, method, url, payload, key) => app.inject({ method, url, payload, headers: { authorization: `Bearer ${user.token}`, ...(key && { 'idempotency-key': key }) } });
  const a = await guest(), b = await guest();
  const hunt = async user => { const r = await req(user, 'POST', '/api/hunts', { habitatId: 'coral' }); assert.equal(r.statusCode, 201); assert.ok(r.json().expiresAt); return r.json().id; };
  const h1 = await hunt(a), h2 = await hunt(b);
  const shot = (user, h, key, speciesId = 'clownfish', shotId = key) => req(user, 'POST', `/api/hunts/${h}/shots`, { shotId, speciesId }, key);
  const cooldown = async user => db.query("UPDATE player_equipment SET last_shot_at=clock_timestamp()-interval '2 seconds' WHERE player_id=$1", [user.player.id]);
  await t.test('token hash only, auth, ownership, strict HTTP schema', async () => {
    const stored = (await db.query('SELECT token_hash FROM sessions WHERE id=$1', [a.session.id])).rows[0];
    assert.equal(stored.token_hash.length, 32); assert.notEqual(stored.token_hash.toString(), a.token);
    assert.equal((await app.inject('/api/sessions/me')).statusCode, 401);
    assert.equal((await req(a, 'GET', '/api/sessions/me')).statusCode, 200);
    assert.equal((await req(b, 'GET', `/api/hunts/${h1}`)).statusCode, 404);
    assert.equal((await shot(b, h1, 'wrongowner')).statusCode, 404);
    assert.equal((await req(a, 'POST', `/api/hunts/${h1}/shots`, { shotId: 'forged001', speciesId: 'clownfish', playerId: b.player.id }, 'forged001')).statusCode, 400);
  });
  let receipt;
  await t.test('atomic catch, provenance and replay keys', async () => {
    const result = await shot(a, h1, 'catch0001'); assert.equal(result.statusCode, 201, result.body);
    receipt = result.json().receipt; assert.equal(receipt.trustTier, 'client_simulated_validated'); assert.equal(receipt.playerId, a.player.id);
    assert.ok(receipt.nonce); assert.ok(receipt.expiresAt);
    assert.equal((await shot(a, h1, 'catch0001')).json().error, 'idempotency_replay');
    assert.equal((await shot(a, h1, 'otherkey1', 'clownfish', 'catch0001')).json().error, 'duplicate_shot');
    assert.equal((await db.query('SELECT quantity FROM player_inventory WHERE player_id=$1', [a.player.id])).rows[0].quantity, 1);
    assert.equal((await db.query("SELECT population_count FROM populations WHERE species_id='clownfish'")).rows[0].population_count, 29);
    await assert.rejects(db.query('INSERT INTO inventory_receipts(receipt_id,player_id,species_id) VALUES($1,$2,$3)', [receipt.id, a.player.id, 'clownfish']), e => e.code === '23505');
    assert.equal((await db.query('SELECT count(*)::int n FROM population_events WHERE receipt_id=$1', [receipt.id])).rows[0].n, 1);
  });
  await t.test('demo catches every fish regardless of equipment; cooldown budget and expiration still apply', async () => {
    assert.equal((await shot(a, h1, 'unknown01', 'missing')).json().error, 'species_unavailable');
    await cooldown(a);
    assert.equal((await shot(a, h1, 'level0001', 'bluetang')).statusCode, 201);
    assert.equal((await shot(a, h1, 'tooquick1')).json().error, 'shot_rate_limited');
    const other = await hunt(a); assert.equal((await shot(a, other, 'newhunt01')).json().error, 'shot_rate_limited');
    await db.query('UPDATE catch_sessions SET shots_used=max_shots WHERE id=$1', [other]);
    assert.equal((await shot(a, other, 'budget001')).json().error, 'shot_limit_reached');
    await db.query("UPDATE catch_sessions SET issued_at=clock_timestamp()-interval '1 hour', expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [other]);
    assert.equal((await shot(a, other, 'expired01')).json().error, 'hunt_expired');
  });
  await t.test('database failure after population update rolls back everything', async () => {
    await cooldown(a);
    await db.query(`CREATE FUNCTION fail_inventory() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected inventory failure'; END $$;
      CREATE TRIGGER fail_inventory BEFORE INSERT OR UPDATE ON player_inventory FOR EACH ROW EXECUTE FUNCTION fail_inventory()`);
    try {
      const response = await shot(a, h1, 'rollback1'); assert.equal(response.statusCode, 500); assert.equal(response.json().error, 'internal_error');
      assert.equal((await db.query("SELECT population_count FROM populations WHERE species_id='clownfish'")).rows[0].population_count, 29);
      assert.equal((await db.query('SELECT count(*)::int n FROM catch_receipts')).rows[0].n, 2);
      assert.equal((await db.query('SELECT count(*)::int n FROM shot_nonces')).rows[0].n, 2);
      assert.equal((await req(a, 'GET', `/api/hunts/${h1}`)).json().shotsUsed, 2);
    } finally { await db.query('DROP TRIGGER fail_inventory ON player_inventory; DROP FUNCTION fail_inventory()'); }
  });
  await t.test('concurrent last fish never overshoots and failed key remains retryable', async () => {
    await cooldown(a); await db.query("UPDATE populations SET population_count=1 WHERE species_id='clownfish'");
    const results = await Promise.all([shot(a, h1, 'lastfish1'), shot(b, h2, 'lastfish2')]);
    assert.deepEqual(results.map(r => r.statusCode).sort(), [201, 409]);
    assert.equal(results.find(r => r.statusCode === 409).json().error, 'population_depleted');
    assert.equal((await db.query("SELECT population_count FROM populations WHERE species_id='clownfish'")).rows[0].population_count, 0);
    assert.equal((await db.query('SELECT sum(quantity)::int n FROM player_inventory')).rows[0].n, 3);
    assert.equal((await db.query('SELECT count(*)::int n FROM catch_receipts')).rows[0].n, 3);
  });
  await t.test('player-scoped replay remains blocked across hunts', async () => {
    const other=await hunt(a);
    assert.equal((await shot(a,other,'catch0001')).json().error,'idempotency_replay');
    assert.equal((await shot(a,other,'crosshuntkey','clownfish','catch0001')).json().error,'duplicate_shot');
  });
  await t.test('session expiry during population lock wait rolls back catch', async () => {
    const user=await guest(),id=await hunt(user);
    await db.query("UPDATE populations SET population_count=2 WHERE species_id='clownfish'");
    const locker=await db.connect();
    await locker.query('BEGIN');
    await locker.query("SELECT * FROM populations WHERE species_id='clownfish' FOR UPDATE");
    await db.query("UPDATE sessions SET expires_at=clock_timestamp()+interval '400 milliseconds' WHERE id=$1",[user.session.id]);
    const request=shot(user,id,'expireswaiting');
    try{
      const deadline=Date.now()+2000;let blocked=false;
      while(Date.now()<deadline){
        const q=await db.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM populations%'");
        if(q.rows[0].n){blocked=true;break;}await new Promise(r=>setTimeout(r,10));
      }
      assert.ok(blocked,'shot must actually wait on population lock');
      await new Promise(r=>setTimeout(r,450));
      await locker.query('COMMIT');
      assert.equal((await request).json().error,'authentication_required');
      assert.equal((await db.query('SELECT count(*)::int n FROM catch_receipts WHERE player_id=$1',[user.player.id])).rows[0].n,0);
      assert.equal((await db.query("SELECT population_count FROM populations WHERE species_id='clownfish'")).rows[0].population_count,2);
    }finally{await locker.query('ROLLBACK');locker.release();await request;}
  });
  await t.test('expired and revoked authentication blocked, CORS permits logout', async () => {
    assert.equal((await req(a, 'DELETE', '/api/sessions/current')).statusCode, 204);
    assert.equal((await req(a, 'GET', '/api/sessions/me')).statusCode, 401);
    await db.query("UPDATE sessions SET created_at=clock_timestamp()-interval '1 hour',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [b.session.id]);
    assert.equal((await req(b, 'POST', '/api/hunts', { habitatId: 'coral' })).statusCode, 401);
    const preflight = await app.inject({ method: 'OPTIONS', url: '/api/sessions/current', headers: { origin: 'http://localhost:8080' } });
    assert.match(preflight.headers['access-control-allow-methods'], /DELETE/);
  });
});
