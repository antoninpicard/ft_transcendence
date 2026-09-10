import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryOne, closePool } from '../../src/db/pool.js';

after(async () => {
  await closePool();
});

describe('schéma d authentification', () => {
  it('ajoute password_hash sur users', async () => {
    const row = await queryOne(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'password_hash'`,
    );
    assert.ok(row, 'la colonne password_hash doit exister');
    assert.equal(row.is_nullable, 'NO');
  });

  it('crée la table sessions', async () => {
    const row = await queryOne(
      `SELECT count(*) AS count FROM information_schema.columns
        WHERE table_name = 'sessions'
          AND column_name IN ('id', 'user_id', 'token_hash', 'created_at', 'last_seen_at', 'expires_at')`,
    );
    assert.equal(Number(row.count), 6);
  });

  it('révoque les sessions quand le compte disparaît', async () => {
    const row = await queryOne(
      `SELECT rc.delete_rule
         FROM information_schema.referential_constraints rc
         JOIN information_schema.table_constraints tc
           ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_name = 'sessions'`,
    );
    assert.equal(row.delete_rule, 'CASCADE');
  });
});
