import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryOne, closePool } from '../../src/db/pool.js';
import { uniqueUser, cleanupUsers } from './helpers.js';
import { listUsers, getPublicUser, getPrivateUser } from '../../src/services/users.service.js';

const created = [];

async function insertUser() {
  const user = uniqueUser();
  created.push(user.username);
  const row = await queryOne(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, 'x') RETURNING id`,
    [user.username, user.email],
  );
  return { id: row.id, ...user };
}

after(async () => {
  await cleanupUsers(created);
  await closePool();
});

describe('projections utilisateur', () => {
  it("n'expose pas les emails dans l'annuaire", async () => {
    await insertUser();
    const { items } = await listUsers({ limit: 100, offset: 0 });
    assert.ok(items.length > 0);
    for (const item of items) {
      assert.equal('email' in item, false);
      assert.equal('password_hash' in item, false);
      assert.equal('passwordHash' in item, false);
    }
  });

  it("n'expose pas l'email sur la fiche publique", async () => {
    const user = await insertUser();
    const found = await getPublicUser(user.id);
    assert.equal(found.username, user.username);
    assert.equal('email' in found, false);
  });

  it("expose l'email sur la fiche privée", async () => {
    const user = await insertUser();
    const found = await getPrivateUser(user.id);
    assert.equal(found.email, user.email);
    assert.equal('passwordHash' in found, false);
  });
});
