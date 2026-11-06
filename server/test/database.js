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
      ('clownfish','Clownfish','coral','common',1,18,100),('bluetang','Blue Tang','coral','uncommon',2,26,80),('grouper','Grouper','coral','rare',3,65,35)`);
    await db.query(`INSERT INTO populations(habitat_id,species_id,population_count,capacity,regen_per_hour_milli)
      SELECT 'coral',id,30,population_capacity,1200 FROM species`);
    await db.query("INSERT INTO merchant_accounts(id,total_treasury,available_balance,max_order) VALUES('dock-merchant',10000,10000,500)");
    await db.query("INSERT INTO merchant_inventory SELECT 'dock-merchant',id,0 FROM species");
    await db.query("INSERT INTO merchant_demand SELECT 'dock-merchant',id,20,base_price*2 FROM species");
    await db.query('INSERT INTO market_state(species_id,current_price,demand) SELECT id,base_price,20 FROM species');
    await db.query("INSERT INTO game_treasury(id) VALUES('main')");
    return { db, close };
  } catch (error) { await close(); throw error; }
}
