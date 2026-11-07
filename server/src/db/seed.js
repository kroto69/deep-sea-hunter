import { pool } from './pool.js';
import { config } from '../config/env.js';

const species = [
  { id: 'clownfish', name: 'Clownfish', rarity: 'common', price: 18, need: 25, capacity: 100, regen: 1200, population: 65 },
  { id: 'bluetang', name: 'Blue Tang', rarity: 'uncommon', price: 26, need: 18, capacity: 80, regen: 750, population: 42 },
  { id: 'angelfish', name: 'Angelfish', rarity: 'uncommon', price: 31, need: 14, capacity: 100, regen: 700, population: 55 },
  { id: 'butterfly', name: 'Butterflyfish', rarity: 'common', price: 23, need: 20, capacity: 100, regen: 1000, population: 65 },
  { id: 'parrotfish', name: 'Parrotfish', rarity: 'rare', price: 35, need: 12, capacity: 100, regen: 500, population: 35 },
  { id: 'grouper', name: 'Grouper', rarity: 'rare', price: 65, need: 8, capacity: 35, regen: 250, population: 16 },
  { id: 'barracuda', name: 'Barracuda', rarity: 'rare', price: 58, need: 8, capacity: 100, regen: 300, population: 25 },
  { id: 'damselfish', name: 'Damselfish', rarity: 'common', price: 12, need: 24, capacity: 100, regen: 1400, population: 75 },
  { id: 'chromis', name: 'Blue Chromis', rarity: 'common', price: 13, need: 24, capacity: 100, regen: 1400, population: 75 },
  { id: 'wrasse', name: 'Rainbow Wrasse', rarity: 'uncommon', price: 29, need: 14, capacity: 100, regen: 800, population: 50 },
  { id: 'lionfish', name: 'Lionfish', rarity: 'rare', price: 42, need: 10, capacity: 100, regen: 400, population: 30 },
  { id: 'tuna', name: 'Bluefin Tuna', rarity: 'rare', price: 55, need: 8, capacity: 100, regen: 350, population: 28 },
  { id: 'cardinalfish', name: 'Flame Cardinalfish', rarity: 'common', price: 17, need: 20, capacity: 100, regen: 1100, population: 65 },
  { id: 'moorishidol', name: 'Moorish Idol', rarity: 'uncommon', price: 32, need: 12, capacity: 100, regen: 700, population: 45 },
  { id: 'triggerfish', name: 'Picasso Triggerfish', rarity: 'uncommon', price: 38, need: 10, capacity: 100, regen: 650, population: 42 },
  { id: 'pufferfish', name: 'Porcupine Pufferfish', rarity: 'uncommon', price: 34, need: 10, capacity: 100, regen: 650, population: 42 },
  { id: 'seahorse', name: 'Tiger-Tail Seahorse', rarity: 'rare', price: 48, need: 8, capacity: 100, regen: 300, population: 25 },
  { id: 'sardine', name: 'Sardine', rarity: 'common', price: 10, need: 25, capacity: 100, regen: 1500, population: 80 },
  { id: 'squid', name: 'Reef Squid', rarity: 'uncommon', price: 36, need: 12, capacity: 100, regen: 600, population: 45 }
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
      VALUES($1,$2,'coral',$3,1,$4,FALSE,TRUE,$5)
      ON CONFLICT(id) DO UPDATE SET min_equipment_level=1,base_price=EXCLUDED.base_price`, [s.id,s.name,s.rarity,s.price,s.capacity]);
    await client.query(`INSERT INTO populations(habitat_id,species_id,population_count,capacity,regen_per_hour_milli)
      VALUES('coral',$1,$2,$3,$4) ON CONFLICT(habitat_id,species_id) DO NOTHING`, [s.id,s.population,s.capacity,s.regen]);
    await client.query(`INSERT INTO market_state(species_id,stock,demand,current_price)
      VALUES($1,0,$2,$3) ON CONFLICT(species_id) DO NOTHING`, [s.id,s.need,s.price]);
    await client.query(`INSERT INTO merchant_demand(merchant_id,species_id,desired_quantity,max_price)
      VALUES('dock-merchant',$1,$2,$3) ON CONFLICT(merchant_id,species_id) DO UPDATE
      SET desired_quantity=EXCLUDED.desired_quantity,max_price=EXCLUDED.max_price`, [s.id,s.need,s.price * 3]);
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
