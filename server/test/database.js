import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

export async function testDatabase() {
  if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required; application tables are never truncated');
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}`, max: 16 });
  const close = async () => { await db.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); };
  try {
    const directory = new URL('../migrations/', import.meta.url);
    for (const file of (await readdir(directory)).filter(f => f.endsWith('.sql')).sort()) await db.query(await readFile(new URL(file, directory), 'utf8'));
    await db.query("INSERT INTO habitats(id,name) VALUES('coral','Coral')");
    await db.query(`INSERT INTO species(id,name,habitat_id,rarity,min_equipment_level,base_price,population_capacity) VALUES
      ('clownfish','Clownfish','coral','common',1,18,100),('bluetang','Blue Tang','coral','uncommon',2,26,80),('grouper','Grouper','coral','rare',3,65,35),
      ('angelfish','Angelfish','coral','uncommon',1,31,100),('butterfly','Butterflyfish','coral','common',1,23,100),
      ('parrotfish','Parrotfish','coral','rare',1,35,100),('barracuda','Barracuda','coral','rare',1,58,100),
      ('damselfish','Damselfish','coral','common',1,12,100),('chromis','Blue Chromis','coral','common',1,13,100),
      ('wrasse','Rainbow Wrasse','coral','uncommon',1,29,100),('lionfish','Lionfish','coral','rare',1,42,100),
      ('tuna','Bluefin Tuna','coral','rare',1,55,100),('cardinalfish','Flame Cardinalfish','coral','common',1,17,100),
      ('moorishidol','Moorish Idol','coral','uncommon',1,32,100),('triggerfish','Picasso Triggerfish','coral','uncommon',1,38,100),
      ('pufferfish','Porcupine Pufferfish','coral','uncommon',1,34,100),('seahorse','Tiger-Tail Seahorse','coral','rare',1,48,100),
      ('sardine','Sardine','coral','common',1,10,100),('squid','Reef Squid','coral','uncommon',1,36,100)`);
    await db.query(`INSERT INTO populations(habitat_id,species_id,population_count,capacity,regen_per_hour_milli)
      SELECT 'coral',id,30,population_capacity,1200 FROM species`);
    await db.query("INSERT INTO merchant_accounts(id,total_treasury,available_balance,max_order) VALUES('dock-merchant',10000,10000,500)");
    await db.query("UPDATE merchant_accounts SET max_tick=10000 WHERE id='dock-merchant'");
    await db.query("INSERT INTO merchant_inventory SELECT 'dock-merchant',id,0 FROM species");
    await db.query(`INSERT INTO merchant_demand(merchant_id,species_id,desired_quantity,max_price)
      SELECT 'dock-merchant',id,CASE id WHEN 'clownfish' THEN 25 WHEN 'bluetang' THEN 18 WHEN 'grouper' THEN 8
      WHEN 'angelfish' THEN 14 WHEN 'butterfly' THEN 20 WHEN 'parrotfish' THEN 12 WHEN 'barracuda' THEN 8
      WHEN 'damselfish' THEN 24 WHEN 'chromis' THEN 24 WHEN 'wrasse' THEN 14 WHEN 'lionfish' THEN 10 WHEN 'tuna' THEN 8
      WHEN 'cardinalfish' THEN 20 WHEN 'moorishidol' THEN 12 WHEN 'triggerfish' THEN 10 WHEN 'pufferfish' THEN 10
      WHEN 'seahorse' THEN 8 WHEN 'sardine' THEN 25 WHEN 'squid' THEN 12 END,base_price*3 FROM species`);
    await db.query('INSERT INTO market_state(species_id,current_price,demand) SELECT id,base_price,20 FROM species');
    await db.query("INSERT INTO game_treasury(id) VALUES('main')");
    return { db, close };
  } catch (error) { await close(); throw error; }
}
