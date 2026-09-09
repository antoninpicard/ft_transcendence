import pg from 'pg';
import { env } from '../config/env.js';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Erreur inattendue sur une connexion inactive :', err);
});

export function query(text, params) {
  return pool.query(text, params);
}

export async function queryOne(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0];
}

export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function checkConnection() {
  await pool.query('SELECT 1');
}

export function closePool() {
  return pool.end();
}
