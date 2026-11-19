import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import { query, queryOne, closePool } from '../../src/db/pool.js';
import { uniqueUser, cleanupUsers } from './helpers.js';
import { findOrCreateFortyTwoUser } from '../../src/services/oauth.service.js';

const created = [];

function profile(overrides = {}) {
  const suffix = randomBytes(4).toString('hex');
  return {
    fortytwoId: randomInt(1_000_000, 2_000_000_000),
    login: `ft${suffix}`,
    email: `ft-${suffix}@student.example.test`,
    ...overrides,
  };
}

async function track(p) {
  const user = await findOrCreateFortyTwoUser(p);
  created.push(user.username);
  return user;
}

async function insertLocal({ username, email }) {
  created.push(username);
  return queryOne(
    'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [username, email, 'hash-factice'],
  );
}

after(async () => {
  await cleanupUsers(created);
  await closePool();
});

describe('findOrCreateFortyTwoUser', () => {
  it('crée un compte avec le login 42 comme pseudo et sans mot de passe', async () => {
    const p = profile();
    const user = await track(p);

    assert.equal(user.username, p.login);
    assert.equal(user.email, p.email);
    const row = await queryOne(
      'SELECT password_hash, fortytwo_id FROM users WHERE id = $1',
      [user.id],
    );
    assert.equal(row.password_hash, null);
    assert.equal(row.fortytwo_id, p.fortytwoId);
  });

  it('retrouve le même compte à la reconnexion', async () => {
    const p = profile();
    const first = await track(p);
    const second = await track(p);

    assert.equal(second.id, first.id);
    const { rows } = await query('SELECT id FROM users WHERE fortytwo_id = $1', [p.fortytwoId]);
    assert.equal(rows.length, 1);
  });

  it("retrouve le compte par identifiant 42 même si l'email a changé", async () => {
    const p = profile();
    const first = await track(p);
    const second = await track({ ...p, email: `autre-${p.email}` });

    assert.equal(second.id, first.id);
  });

  it("refuse si l'email est déjà pris par un autre compte", async () => {
    const local = uniqueUser();
    const { id } = await insertLocal(local);
    const p = profile({ email: local.email });

    await assert.rejects(findOrCreateFortyTwoUser(p), (err) => err.statusCode === 409);

    const row = await queryOne('SELECT fortytwo_id FROM users WHERE id = $1', [id]);
    assert.equal(row.fortytwo_id, null);
    const none = await queryOne('SELECT id FROM users WHERE fortytwo_id = $1', [p.fortytwoId]);
    assert.equal(none ?? null, null);
  });

  it("suffixe le pseudo s'il est déjà pris", async () => {
    const p = profile();
    await insertLocal({ username: p.login, email: uniqueUser().email });
    const user = await track(p);

    assert.match(user.username, new RegExp(`^${p.login}-[0-9a-f]{4}$`));
  });

  it('remplace un login invalide par un pseudo généré', async () => {
    const user = await track(profile({ login: 'a b!' }));

    assert.match(user.username, /^user-[0-9a-f]{4}$/);
  });

  it('reste sous la longueur maximale de pseudo', async () => {
    const login = randomBytes(10).toString('hex');
    assert.equal(login.length, 20);
    await insertLocal({ username: login, email: uniqueUser().email });
    const user = await track(profile({ login }));

    assert.notEqual(user.username, login);
    assert.ok(user.username.length <= 20);
  });
});
