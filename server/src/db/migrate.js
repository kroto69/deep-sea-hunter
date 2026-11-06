import { readFile, readdir } from 'node:fs/promises';
import { pool } from './pool.js';

const directory = new URL('../../migrations/', import.meta.url);
const migrations = (await readdir(directory)).filter(name => /^\d{3}_[a-z_]+\.sql$/.test(name)).sort()
  .map(name => [name.slice(0, -4), new URL(name, directory)]);
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock($1)', [1_945_837_211]);
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  for (const [version, file] of migrations) {
    const { rowCount } = await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [version]);
    if (rowCount) { console.log(`Migration already applied: ${version}`); continue; }
    await client.query(await readFile(file, 'utf8'));
    await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
    console.log(`Applied migration: ${version}`);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }
