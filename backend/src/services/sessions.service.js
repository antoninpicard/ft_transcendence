import { randomBytes, createHash } from 'node:crypto';
import { query, queryOne } from '../db/pool.js';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return createHash('sha256').update(token).digest();
}

export async function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await query(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hashToken(token), expiresAt],
  );

  return { token, expiresAt };
}

export async function resolveSession(token) {
  if (typeof token !== 'string' || !token) return null;

  const session = await queryOne(
    `SELECT id, user_id AS "userId", expires_at AS "expiresAt"
       FROM sessions WHERE token_hash = $1`,
    [hashToken(token)],
  );
  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await query('DELETE FROM sessions WHERE id = $1', [session.id]);
    return null;
  }

  await query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [session.id]);
  return { id: session.id, userId: session.userId };
}

export async function revokeSession(token) {
  if (typeof token !== 'string' || !token) return;
  await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}
