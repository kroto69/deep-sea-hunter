import { pool } from './pool.js';
import { config } from '../config/env.js';

const species = [
  { id: 'clownfish', name: 'Clownfish', habitat: 'coral', rarity: 'common', level: 1, price: 18, capacity: 100, regen: 1200, population: 65 },
  { id: 'bluetang', name: 'Blue Tang', habitat: 'coral', rarity: 'uncommon', level: 2, price: 26, capacity: 80, regen: 750, population: 42 },
  { id: 'grouper', name: 'Grouper', habitat: 'coral', rarity: 'rare', level: 3, price: 65, capacity: 35, regen: 250, population: 16 }
];

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(`INSERT INTO habitats(id,name,health_ppm) VALUES ('coral','Coral Garden',1000000)
    ON CONFLICT (id) DO NOTHING`);
  await client.query(`INSERT INTO merchant_accounts(id,total_treasury,available_balance,reserved_balance,max_order)
    VALUES('dock-merchant',$1,$1,0,500) ON CONFLICT(id) DO NOTHING`, [config.merchantInitialTreasury]);
  for (const s of species) {
    await client.query(`INSERT INTO species(id,name,habitat_id,rarity,min_equipment_level,base_price,protected,economic_enabled,population_capacity)
      VALUES($1,$2,$3,$4,$5,$6,FALSE,TRUE,$7)
      ON CONFLICT(id) DO NOTHING`, [s.id,s.name,s.habitat,s.rarity,s.level,s.price,s.capacity]);
    await client.query(`INSERT INTO populations(habitat_id,species_id,population_count,capacity,regen_per_hour_milli)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(habitat_id,species_id) DO NOTHING`, [s.habitat,s.id,s.population,s.capacity,s.regen]);
    await client.query(`INSERT INTO market_state(species_id,stock,demand,current_price)
      VALUES($1,0,20,$2) ON CONFLICT(species_id) DO NOTHING`, [s.id,s.price]);
    await client.query(`INSERT INTO merchant_demand(merchant_id,species_id,desired_quantity,max_price)
      VALUES('dock-merchant',$1,20,$2) ON CONFLICT(merchant_id,species_id) DO NOTHING`, [s.id,s.price * 2]);
    await client.query(`INSERT INTO merchant_inventory(merchant_id,species_id,quantity)
      VALUES('dock-merchant',$1,0) ON CONFLICT(merchant_id,species_id) DO NOTHING`, [s.id]);
  }
  await client.query(`INSERT INTO game_treasury(id,balance) VALUES('main',0) ON CONFLICT(id) DO NOTHING`);
  await client.query(`INSERT INTO conservation_subjects(id,habitat_id,species_id,can_release) VALUES
    ('turtle-coral','coral','turtle',FALSE),('manta-coral','coral','manta',FALSE),('turtle-net-coral','coral','turtle',TRUE) ON CONFLICT(id) DO NOTHING`);
  await client.query('COMMIT');
  console.log(`Seeded coral habitat and ${species.length} economic species.`);
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
