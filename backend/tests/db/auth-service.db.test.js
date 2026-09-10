import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryOne, closePool } from '../../src/db/pool.js';
import { uniqueUser, cleanupUsers } from './helpers.js';
import { register, verifyCredentials } from '../../src/services/auth.service.js';

const created = [];

async function registered() {
  const user = uniqueUser();
  created.push(user.username);
  await register(user);
  return user;
}

after(async () => {
  await cleanupUsers(created);
  await closePool();
});

describe('service d authentification', () => {
  it('ne renvoie jamais le hash', async () => {
    const user = await registered();
    const result = await verifyCredentials(user.email, user.password);
    assert.equal('passwordHash' in result, false);
    assert.equal('password_hash' in result, false);
  });

  it('ne stocke pas le mot de passe en clair', async () => {
    const user = await registered();
    const row = await queryOne('SELECT password_hash FROM users WHERE username = $1', [user.username]);
    assert.equal(row.password_hash.includes(user.password), false);
    assert.match(row.password_hash, /^\$argon2id\$/);
  });

  it('accepte la connexion par email', async () => {
    const user = await registered();
    const result = await verifyCredentials(user.email, user.password);
    assert.equal(result.username, user.username);
  });

  it('accepte la connexion par pseudo', async () => {
    const user = await registered();
    const result = await verifyCredentials(user.username, user.password);
    assert.equal(result.email, user.email);
  });

  it('ignore la casse de l identifiant', async () => {
    const user = await registered();
    const result = await verifyCredentials(user.email.toUpperCase(), user.password);
    assert.equal(result.username, user.username);
  });

  it('refuse un mauvais mot de passe et un compte inconnu avec le même message', async () => {
    const user = await registered();
    const wrong = await verifyCredentials(user.email, 'mauvais-mot-de-passe').catch((e) => e);
    const unknown = await verifyCredentials('personne@example.test', user.password).catch((e) => e);

    assert.equal(wrong.statusCode, 401);
    assert.equal(unknown.statusCode, 401);
    assert.equal(wrong.message, unknown.message);
  });

  it('refuse un pseudo déjà pris', async () => {
    const user = await registered();
    const err = await register({ ...uniqueUser(), username: user.username }).catch((e) => e);
    assert.equal(err.statusCode, 409);
  });

  it('refuse un email déjà pris', async () => {
    const user = await registered();
    const err = await register({ ...uniqueUser(), email: user.email }).catch((e) => e);
    assert.equal(err.statusCode, 409);
  });
});
