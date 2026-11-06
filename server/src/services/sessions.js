import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { config } from '../config/env.js';

const tokenHash = token => createHash('sha256').update(token).digest();
const bearer = request => {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization || '');
  return match?.[1] || null;
};

export async function createGuestSession(db) {
  const playerId = randomUUID();
  const sessionId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query("INSERT INTO players(id,mode) VALUES($1,'online_guest')", [playerId]);
    await client.query('INSERT INTO player_accounts(player_id) VALUES($1)', [playerId]);
    await client.query('INSERT INTO player_equipment(player_id) VALUES($1)', [playerId]);
    const { rows } = await client.query(`INSERT INTO sessions(id,player_id,token_hash,expires_at)
      VALUES($1,$2,$3,clock_timestamp()+($4 * interval '1 second')) RETURNING created_at,expires_at`, [sessionId, playerId, tokenHash(token), config.guestSessionTtlSeconds]);
    await client.query('COMMIT');
    return { playerId, sessionId, token, createdAt: rows[0].created_at, expiresAt: rows[0].expires_at };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function authenticate(db, request) {
  const token = bearer(request);
  if (!token) return null;
  const { rows } = await db.query(`SELECT p.id AS player_id, p.mode, s.id AS session_id, s.expires_at
    FROM sessions s JOIN players p ON p.id=s.player_id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()`, [tokenHash(token)]);
  return rows[0] || null;
}

export async function revokeSession(db, playerId, sessionId) {
  const { rowCount } = await db.query(`UPDATE sessions SET revoked_at=clock_timestamp()
    WHERE id=$1 AND player_id=$2 AND revoked_at IS NULL AND expires_at > clock_timestamp()`, [sessionId, playerId]);
  return rowCount > 0;
}

export async function requireActiveSession(client, identity) {
  await client.query('SELECT id FROM sessions WHERE id=$1 AND player_id=$2 FOR SHARE', [identity.sessionId, identity.id]);
  const { rowCount } = await client.query(`SELECT id FROM sessions WHERE id=$1 AND player_id=$2
    AND revoked_at IS NULL AND expires_at > clock_timestamp()`, [identity.sessionId, identity.id]);
  if (!rowCount) throw Object.assign(new Error('authentication_required'), { code: 'authentication_required', statusCode: 401 });
}
