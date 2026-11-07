import { randomUUID } from 'node:crypto';
import { config } from '../config/env.js';
import { requireActiveSession } from './sessions.js';

export class HuntError extends Error {
  constructor(code, statusCode = 400) { super(code); this.code = code; this.statusCode = statusCode; }
}

async function withTransaction(db, fn) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export function validateShot(body, idempotencyKey) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
    Object.keys(body).some(key => key !== 'shotId' && key !== 'speciesId')) throw new HuntError('invalid_body');
  if (typeof body.shotId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(body.shotId)) throw new HuntError('invalid_shot_id');
  if (typeof body.speciesId !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(body.speciesId)) throw new HuntError('invalid_species');
  if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey)) throw new HuntError('invalid_idempotency_key');
}

export async function createHunt(db, identity, habitatId) {
  if (typeof habitatId !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(habitatId)) throw new HuntError('invalid_habitat');
  return withTransaction(db, async client => {
    await requireActiveSession(client, identity);
    const { rows: equipment } = await client.query('SELECT speargun_level FROM player_equipment WHERE player_id=$1 FOR UPDATE', [identity.id]);
    if (!equipment.length) throw new HuntError('player_not_found', 404);
    const { rowCount } = await client.query('SELECT id FROM habitats WHERE id=$1 FOR SHARE', [habitatId]);
    if (!rowCount) throw new HuntError('habitat_not_found', 404);
    const { rows: species } = await client.query(`SELECT s.id,s.min_equipment_level AS "minEquipmentLevel"
      FROM species s JOIN populations p ON p.species_id=s.id AND p.habitat_id=s.habitat_id
      WHERE s.habitat_id=$1 AND s.economic_enabled AND NOT s.protected ORDER BY s.id FOR SHARE OF s`, [habitatId]);
    if (!species.length) throw new HuntError('species_unavailable', 409);
    await requireActiveSession(client, identity);
    const { rows } = await client.query(`INSERT INTO catch_sessions
      (id,player_id,habitat_id,equipment_level,max_shots,min_shot_interval_ms,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+($7 * interval '1 second'))
      RETURNING id,habitat_id AS "habitatId",equipment_level AS "equipmentLevel",
      issued_at AS "issuedAt",expires_at AS "expiresAt",max_shots AS "maxShots",min_shot_interval_ms AS "minShotIntervalMs"`,
      [randomUUID(), identity.id, habitatId, equipment[0].speargun_level, config.catchMaxShots, config.catchMinShotIntervalMs, config.catchSessionTtlSeconds]);
    return { ...rows[0], species };
  });
}

export async function getHunt(db, playerId, huntId) {
  const { rows } = await db.query(`SELECT id,habitat_id AS "habitatId",equipment_level AS "equipmentLevel",
    shots_used AS "shotsUsed",max_shots AS "maxShots",issued_at AS "issuedAt",expires_at AS "expiresAt",
    min_shot_interval_ms AS "minShotIntervalMs",revoked_at IS NOT NULL AS revoked,
    revoked_at IS NULL AND expires_at > clock_timestamp() AS active
    FROM catch_sessions WHERE id=$1 AND player_id=$2`, [huntId, playerId]);
  if (!rows.length) throw new HuntError('hunt_not_found', 404);
  return rows[0];
}

export async function submitShot(db, identity, huntId, body, idempotencyKey) {
  validateShot(body, idempotencyKey);
  const { shotId, speciesId } = body;
  return withTransaction(db, async client => {
    // Lock order: auth session, player equipment, hunt, habitat, species, population.
    // Player lock also serializes cooldown across newly created hunts.
    await requireActiveSession(client, identity);
    const { rows: equipment } = await client.query('SELECT speargun_level,last_shot_at FROM player_equipment WHERE player_id=$1 FOR UPDATE', [identity.id]);
    if (!equipment.length) throw new HuntError('player_not_found', 404);
    const { rows: hunts } = await client.query('SELECT * FROM catch_sessions WHERE id=$1 AND player_id=$2 FOR UPDATE', [huntId, identity.id]);
    const hunt = hunts[0];
    if (!hunt) throw new HuntError('hunt_not_found', 404);
    const { rows: replay } = await client.query(`SELECT idempotency_key FROM catch_receipts
      WHERE player_id=$1 AND (idempotency_key=$2 OR shot_nonce=$3)`, [identity.id, idempotencyKey, shotId]);
    if (replay.length) throw new HuntError(replay.some(r => r.idempotency_key === idempotencyKey) ? 'idempotency_replay' : 'duplicate_shot', 409);
    await client.query('SELECT id FROM habitats WHERE id=$1 FOR SHARE', [hunt.habitat_id]);
    const { rows: fishRows } = await client.query(`SELECT min_equipment_level,protected,economic_enabled
      FROM species WHERE id=$1 AND habitat_id=$2 FOR SHARE`, [speciesId, hunt.habitat_id]);
    const fish = fishRows[0];
    if (!fish || !fish.economic_enabled || fish.protected) throw new HuntError('species_unavailable', 404);
    const { rows: populations } = await client.query(`SELECT population_count FROM populations
      WHERE habitat_id=$1 AND species_id=$2 FOR UPDATE`, [hunt.habitat_id, speciesId]);
    if (!populations.length) throw new HuntError('species_unavailable', 404);
    // Recheck time AFTER all blocking locks; transaction-start now() is not suitable.
    await requireActiveSession(client, identity);
    const { rows: checks } = await client.query(`SELECT clock_timestamp() AS server_time,
      expires_at > clock_timestamp() AS active,
      ($2::timestamptz IS NULL OR clock_timestamp()-$2::timestamptz >= min_shot_interval_ms * interval '1 millisecond') AS allowed
      FROM catch_sessions WHERE id=$1`, [huntId, equipment[0].last_shot_at]);
    const check = checks[0];
    if (hunt.revoked_at || !check.active) throw new HuntError('hunt_expired', 410);
    if (hunt.shots_used >= hunt.max_shots) throw new HuntError('shot_limit_reached', 429);
    if (!check.allowed) throw new HuntError('shot_rate_limited', 429);
    if (populations[0].population_count < 1) throw new HuntError('population_depleted', 409);
    const receiptId = randomUUID();
    await client.query('INSERT INTO shot_nonces(session_id,nonce,created_at) VALUES($1,$2,$3)', [huntId, shotId, check.server_time]);
    const { rows: receipts } = await client.query(`INSERT INTO catch_receipts
      (id,player_id,species_id,habitat_id,session_id,shot_nonce,equipment_level,trust_tier,status,created_at,expires_at,idempotency_key)
      VALUES($1,$2,$3,$4,$5,$6,$7,'client_simulated_validated','valid',$8,$8::timestamptz+interval '24 hours',$9)
      RETURNING id,nonce,player_id AS "playerId",session_id AS "huntId",habitat_id AS "habitatId",species_id AS "speciesId",
        shot_nonce AS "shotId",equipment_level AS "equipmentLevel",trust_tier AS "trustTier",status,
        created_at AS "createdAt",expires_at AS "expiresAt"`,
      [receiptId, identity.id, speciesId, hunt.habitat_id, huntId, shotId, hunt.equipment_level, check.server_time, idempotencyKey]);
    const { rowCount } = await client.query(`UPDATE populations SET population_count=population_count-1,version=version+1
      WHERE habitat_id=$1 AND species_id=$2 AND population_count>0`, [hunt.habitat_id, speciesId]);
    if (!rowCount) throw new HuntError('population_depleted', 409);
    await client.query(`INSERT INTO player_inventory(player_id,species_id,quantity) VALUES($1,$2,1)
      ON CONFLICT(player_id,species_id) DO UPDATE SET quantity=player_inventory.quantity+1,version=player_inventory.version+1`, [identity.id, speciesId]);
    // This unique attachment consumes the receipt's inventory-credit use exactly once.
    await client.query('INSERT INTO inventory_receipts(receipt_id,player_id,species_id) VALUES($1,$2,$3)', [receiptId, identity.id, speciesId]);
    await client.query(`INSERT INTO population_events(id,habitat_id,species_id,event_type,delta,source_key,receipt_id,created_at)
      VALUES($1,$2,$3,'catch',-1,$4,$5,$6)`, [randomUUID(), hunt.habitat_id, speciesId, receiptId, receiptId, check.server_time]);
    await client.query('UPDATE catch_sessions SET shots_used=shots_used+1,last_shot_at=$2 WHERE id=$1', [huntId, check.server_time]);
    await client.query('UPDATE player_equipment SET last_shot_at=$2 WHERE player_id=$1', [identity.id, check.server_time]);
    return { receipt: receipts[0], serverTime: check.server_time };
  });
}
