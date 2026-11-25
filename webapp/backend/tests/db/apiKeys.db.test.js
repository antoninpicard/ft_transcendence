import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query, queryOne, closePool } from '../../src/db/pool.js';
import { uniqueUser, cleanupUsers } from './helpers.js';
import {
  MAX_API_KEYS,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  resolveApiKey,
} from '../../src/services/apiKeys.service.js';

const created = [];
let userId;
let otherId;

async function insertUser() {
  const user = uniqueUser();
  created.push(user.username);
  const row = await queryOne(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, 'x') RETURNING id`,
    [user.username, user.email],
  );
  return row.id;
}

before(async () => {
  userId = await insertUser();
  otherId = await insertUser();
});

after(async () => {
  await cleanupUsers(created);
  await closePool();
});

describe('apiKeys', () => {
  it('ne stocke jamais la clé en clair', async () => {
    const { id, key } = await createApiKey(userId, 'stockage');
    const row = await queryOne('SELECT * FROM api_keys WHERE id = $1', [id]);
    assert.notEqual(row.key_hash.toString('utf8'), key);
    for (const value of Object.values(row)) {
      assert.ok(!String(value).includes(key));
    }
  });

  it('montre la clé seulement à la création', async () => {
    const created = await createApiKey(userId, 'visible');
    assert.ok(created.key.startsWith('trk_'));
    assert.equal(created.prefix, created.key.slice(0, 12));
    assert.equal(created.lastUsedAt, null);
    const listed = await listApiKeys(userId);
    const found = listed.find((item) => item.id === created.id);
    assert.ok(found);
    assert.equal(found.name, 'visible');
    assert.ok(!('key' in found));
    assert.ok(!('keyHash' in found));
  });

  it('liste les clés les plus récentes en premier', async () => {
    const owner = await insertUser();
    const first = await createApiKey(owner, 'première');
    const second = await createApiKey(owner, 'seconde');
    const listed = await listApiKeys(owner);
    assert.deepEqual(listed.map((item) => item.id), [second.id, first.id]);
  });

  it('résout une clé et met à jour last_used_at', async () => {
    const { id, key } = await createApiKey(userId, 'résolution');
    const resolved = await resolveApiKey(key);
    assert.deepEqual(resolved, { id, userId });
    const row = await queryOne('SELECT last_used_at FROM api_keys WHERE id = $1', [id]);
    assert.notEqual(row.last_used_at, null);
  });

  it('ne résout ni une clé inconnue ni une clé mal formée', async () => {
    assert.equal(await resolveApiKey('trk_court'), null);
    assert.equal(await resolveApiKey(undefined), null);
    assert.equal(await resolveApiKey(`trk_${'A'.repeat(43)}`), null);
  });

  it('refuse une onzième clé', async () => {
    const owner = await insertUser();
    for (let i = 0; i < MAX_API_KEYS; i += 1) {
      await createApiKey(owner, `clé ${i}`);
    }
    await assert.rejects(createApiKey(owner, 'de trop'), (err) => err.statusCode === 409);
    const row = await queryOne('SELECT count(*) AS count FROM api_keys WHERE user_id = $1', [owner]);
    assert.equal(Number(row.count), MAX_API_KEYS);
  });

  it('refuse une onzième clé en cas de créations simultanées', async () => {
    const owner = await insertUser();
    const results = await Promise.allSettled(
      Array.from({ length: MAX_API_KEYS + 3 }, (_, i) => createApiKey(owner, `clé ${i}`)),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, MAX_API_KEYS);
    const row = await queryOne('SELECT count(*) AS count FROM api_keys WHERE user_id = $1', [owner]);
    assert.equal(Number(row.count), MAX_API_KEYS);
  });

  it('révoque une clé, pas celle d un autre', async () => {
    const { id, key } = await createApiKey(userId, 'révocation');
    assert.equal(await revokeApiKey(otherId, id), false);
    assert.notEqual(await resolveApiKey(key), null);
    assert.equal(await revokeApiKey(userId, id), true);
    assert.equal(await resolveApiKey(key), null);
    assert.equal(await revokeApiKey(userId, id), false);
  });

  it('supprime les clés avec l utilisateur', async () => {
    const owner = await insertUser();
    await createApiKey(owner, 'cascade');
    await query('DELETE FROM users WHERE id = $1', [owner]);
    const row = await queryOne('SELECT count(*) AS count FROM api_keys WHERE user_id = $1', [owner]);
    assert.equal(Number(row.count), 0);
  });
});
