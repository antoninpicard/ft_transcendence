import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { queryOne, closePool } from '../../src/db/pool.js';
import { uniqueUser, cleanupUsers } from './helpers.js';
import {
  linkBadge,
  findUserIdByUidHash,
  hasBadge,
  unlinkBadge,
} from '../../src/services/badges.service.js';

const created = [];
let userA;
let userB;

async function createUser() {
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
  userA = await createUser();
  userB = await createUser();
});

after(async () => {
  await cleanupUsers(created);
  await closePool();
});

describe('badges.service', () => {
  it('lie un badge puis le retrouve', async () => {
    const hash = randomBytes(32);
    assert.equal(await linkBadge(userA, hash), 'paired');
    assert.equal(await findUserIdByUidHash(hash), userA);
    assert.equal(await hasBadge(userA), true);
  });

  it('renvoie null pour un badge inconnu', async () => {
    assert.equal(await findUserIdByUidHash(randomBytes(32)), null);
  });

  it('remplace le badge précédent du compte', async () => {
    const first = randomBytes(32);
    const second = randomBytes(32);
    await linkBadge(userB, first);
    assert.equal(await linkBadge(userB, second), 'paired');
    assert.equal(await findUserIdByUidHash(first), null);
    assert.equal(await findUserIdByUidHash(second), userB);
  });

  it('refuse le badge d\'un autre compte et garde l\'ancien', async () => {
    const mine = randomBytes(32);
    const theirs = randomBytes(32);
    await linkBadge(userA, mine);
    await linkBadge(userB, theirs);
    assert.equal(await linkBadge(userA, theirs), 'already-linked');
    assert.equal(await findUserIdByUidHash(mine), userA);
    assert.equal(await findUserIdByUidHash(theirs), userB);
  });

  it('signale un compte inexistant', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    assert.equal(await linkBadge(ghost, randomBytes(32)), 'user-gone');
  });

  it('accepte de ré-appairer son propre badge', async () => {
    const hash = randomBytes(32);
    await linkBadge(userA, hash);
    assert.equal(await linkBadge(userA, hash), 'paired');
    assert.equal(await findUserIdByUidHash(hash), userA);
  });

  it('délie un badge', async () => {
    await linkBadge(userA, randomBytes(32));
    await unlinkBadge(userA);
    assert.equal(await hasBadge(userA), false);
  });
});
