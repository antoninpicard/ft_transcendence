import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query, queryOne, closePool } from '../../src/db/pool.js';
import { uniqueUser, cleanupUsers } from './helpers.js';
import { createSession, resolveSession, revokeSession } from '../../src/services/sessions.service.js';

const created = [];
let userId;

before(async () => {
  const user = uniqueUser();
  created.push(user.username);
  const row = await queryOne(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, 'x') RETURNING id`,
    [user.username, user.email],
  );
  userId = row.id;
});

after(async () => {
  await cleanupUsers(created);
  await closePool();
});

describe('sessions', () => {
  it('ne stocke jamais le jeton en clair', async () => {
    const { token } = await createSession(userId);
    const row = await queryOne(
      'SELECT token_hash FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId],
    );
    assert.equal(row.token_hash.includes(token), false);
    assert.equal(row.token_hash.length, 32);
  });

  it('résout un jeton valide vers son utilisateur', async () => {
    const { token } = await createSession(userId);
    const session = await resolveSession(token);
    assert.equal(session.userId, userId);
  });

  it('refuse un jeton inconnu', async () => {
    assert.equal(await resolveSession('jeton-inexistant'), null);
  });

  it('refuse une absence de jeton', async () => {
    assert.equal(await resolveSession(undefined), null);
  });

  it('refuse et supprime une session expirée', async () => {
    await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    const { token } = await createSession(userId);
    await query(
      "UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1",
      [userId],
    );
    assert.equal(await resolveSession(token), null);
    const row = await queryOne('SELECT count(*) AS count FROM sessions WHERE user_id = $1', [userId]);
    assert.equal(Number(row.count), 0);
  });

  it('révoque une session', async () => {
    const { token } = await createSession(userId);
    await revokeSession(token);
    assert.equal(await resolveSession(token), null);
  });

  it('supprime les sessions avec le compte', async () => {
    await createSession(userId);
    await query('DELETE FROM users WHERE id = $1', [userId]);
    const row = await queryOne('SELECT count(*) AS count FROM sessions WHERE user_id = $1', [userId]);
    assert.equal(Number(row.count), 0);
  });
});
