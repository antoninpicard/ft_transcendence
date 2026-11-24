import { query, queryOne, transaction } from '../db/pool.js';
import { isUniqueViolation, PG_FOREIGN_KEY_VIOLATION } from '../db/errors.js';

export async function linkBadge(userId, uidHash) {
  try {
    await transaction(async (client) => {
      await client.query('DELETE FROM badges WHERE user_id = $1', [userId]);
      await client.query(
        'INSERT INTO badges (user_id, uid_hash) VALUES ($1, $2)',
        [userId, uidHash],
      );
    });
    return 'paired';
  } catch (err) {
    if (isUniqueViolation(err, 'badges_uid_hash_key')) return 'already-linked';
    if (err?.code === PG_FOREIGN_KEY_VIOLATION) return 'user-gone';
    throw err;
  }
}

export async function findUserIdByUidHash(uidHash) {
  const row = await queryOne(
    'SELECT user_id AS "userId" FROM badges WHERE uid_hash = $1',
    [uidHash],
  );
  return row ? row.userId : null;
}

export async function hasBadge(userId) {
  const row = await queryOne('SELECT 1 FROM badges WHERE user_id = $1', [userId]);
  return Boolean(row);
}

export async function unlinkBadge(userId) {
  await query('DELETE FROM badges WHERE user_id = $1', [userId]);
}
