import { query, queryOne, transaction } from '../db/pool.js';
import { AppError } from '../utils/AppError.js';
import { generateApiKey, hashApiKey, isWellFormedApiKey } from '../utils/apiKey.js';

export const MAX_API_KEYS = 10;

const COLUMNS = 'id, name, prefix, created_at AS "createdAt", last_used_at AS "lastUsedAt"';

export async function createApiKey(userId, name) {
  const { key, prefix, hash } = generateApiKey();

  const row = await transaction(async (client) => {
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const { rows: counted } = await client.query(
      'SELECT count(*) AS count FROM api_keys WHERE user_id = $1',
      [userId],
    );
    if (Number(counted[0].count) >= MAX_API_KEYS) {
      throw AppError.conflict(`Limite de ${MAX_API_KEYS} clés d'API atteinte`);
    }
    const { rows } = await client.query(
      `INSERT INTO api_keys (user_id, name, key_hash, prefix)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [userId, name, hash, prefix],
    );
    return rows[0];
  });

  return { ...row, key };
}

export async function listApiKeys(userId) {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM api_keys
      WHERE user_id = $1
      ORDER BY created_at DESC, id`,
    [userId],
  );
  return rows;
}

export async function revokeApiKey(userId, keyId) {
  const { rowCount } = await query(
    'DELETE FROM api_keys WHERE id = $1 AND user_id = $2',
    [keyId, userId],
  );
  return rowCount > 0;
}

export async function resolveApiKey(key) {
  if (!isWellFormedApiKey(key)) return null;

  const row = await queryOne(
    `UPDATE api_keys SET last_used_at = now()
      WHERE key_hash = $1
      RETURNING id, user_id AS "userId"`,
    [hashApiKey(key)],
  );
  return row ?? null;
}
