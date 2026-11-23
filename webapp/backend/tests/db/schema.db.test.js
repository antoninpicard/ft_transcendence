import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query, queryOne, closePool } from '../../src/db/pool.js';
import { uniqueUser, cleanupUsers } from './helpers.js';

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
    assert.equal(row.is_nullable, 'YES');
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

  it('ajoute fortytwo_id unique sur users', async () => {
    const row = await queryOne(
      `SELECT constraint_type FROM information_schema.table_constraints
        WHERE table_name = 'users' AND constraint_name = 'users_fortytwo_id_key'`,
    );
    assert.ok(row, 'la contrainte users_fortytwo_id_key doit exister');
    assert.equal(row.constraint_type, 'UNIQUE');
  });

  it('crée la table badges', async () => {
    const row = await queryOne(
      `SELECT count(*) AS count FROM information_schema.columns
        WHERE table_name = 'badges'
          AND column_name IN ('id', 'user_id', 'uid_hash', 'created_at')`,
    );
    assert.equal(Number(row.count), 4);
    const type = await queryOne(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = 'badges' AND column_name = 'uid_hash'`,
    );
    assert.equal(type.data_type, 'bytea');
  });

  it('rend badge et compte uniques l un pour l autre', async () => {
    const row = await queryOne(
      `SELECT count(*) AS count FROM information_schema.table_constraints
        WHERE table_name = 'badges' AND constraint_type = 'UNIQUE'
          AND constraint_name IN ('badges_user_id_key', 'badges_uid_hash_key')`,
    );
    assert.equal(Number(row.count), 2);
  });

  it('supprime le badge avec le compte', async () => {
    const row = await queryOne(
      `SELECT rc.delete_rule
         FROM information_schema.referential_constraints rc
         JOIN information_schema.table_constraints tc
           ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_name = 'badges' AND tc.constraint_type = 'FOREIGN KEY'`,
    );
    assert.equal(row.delete_rule, 'CASCADE');
  });

  it('crée la table api_keys avec un hash unique', async () => {
    const row = await queryOne(
      `SELECT count(*) AS count FROM information_schema.columns
        WHERE table_name = 'api_keys'
          AND column_name IN ('id', 'user_id', 'name', 'key_hash', 'prefix', 'created_at', 'last_used_at')`,
    );
    assert.equal(Number(row.count), 7);
    const type = await queryOne(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = 'api_keys' AND column_name = 'key_hash'`,
    );
    assert.equal(type.data_type, 'bytea');
    const constraint = await queryOne(
      `SELECT constraint_type FROM information_schema.table_constraints
        WHERE table_name = 'api_keys' AND constraint_name = 'api_keys_key_hash_key'`,
    );
    assert.ok(constraint, 'la contrainte api_keys_key_hash_key doit exister');
    assert.equal(constraint.constraint_type, 'UNIQUE');
  });

  it('crée la table friendships avec une seule ligne par couple', async () => {
    const columns = await queryOne(
      `SELECT count(*) AS count FROM information_schema.columns
        WHERE table_name = 'friendships'
          AND column_name IN ('id', 'requester_id', 'addressee_id', 'status', 'created_at', 'accepted_at')`,
    );
    assert.equal(Number(columns.count), 6);
    const index = await queryOne(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'friendships' AND indexname = 'friendships_pair_key'`,
    );
    assert.ok(index, 'l index friendships_pair_key doit exister');
    assert.match(index.indexdef, /UNIQUE/);

    const a = uniqueUser();
    const b = uniqueUser();
    try {
      const ids = [];
      for (const user of [a, b]) {
        const created = await queryOne(
          'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id',
          [user.username, user.email],
        );
        ids.push(created.id);
      }
      await query(
        `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'pending')`,
        [ids[0], ids[1]],
      );
      await assert.rejects(
        query(
          `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'pending')`,
          [ids[1], ids[0]],
        ),
        { code: '23505' },
      );
    } finally {
      await cleanupUsers([a.username, b.username]);
    }
  });

  it('refuse une amitié avec soi-même', async () => {
    const a = uniqueUser();
    try {
      const created = await queryOne(
        'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id',
        [a.username, a.email],
      );
      await assert.rejects(
        query(
          `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $1, 'pending')`,
          [created.id],
        ),
        { code: '23514' },
      );
    } finally {
      await cleanupUsers([a.username]);
    }
  });

  it('crée la table messages', async () => {
    const row = await queryOne(
      `SELECT count(*) AS count FROM information_schema.columns
        WHERE table_name = 'messages'
          AND column_name IN ('id', 'sender_id', 'recipient_id', 'body', 'created_at')`,
    );
    assert.equal(Number(row.count), 5);
    const body = await queryOne(
      `SELECT data_type, is_nullable FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'body'`,
    );
    assert.equal(body.data_type, 'text');
    assert.equal(body.is_nullable, 'NO');
    const index = await queryOne(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'messages' AND indexname = 'messages_pair_created_idx'`,
    );
    assert.ok(index, 'l index messages_pair_created_idx doit exister');
  });

  it('supprime clés, amitiés et messages avec le compte', async () => {
    const rows = await query(
      `SELECT tc.table_name, rc.delete_rule
         FROM information_schema.referential_constraints rc
         JOIN information_schema.table_constraints tc
           ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_name IN ('api_keys', 'friendships', 'messages')
          AND tc.constraint_type = 'FOREIGN KEY'`,
    );
    assert.equal(rows.rows.length, 5);
    for (const row of rows.rows) {
      assert.equal(row.delete_rule, 'CASCADE');
    }
  });
});
