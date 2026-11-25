import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const created = [];
let server;
let closePool;
let uniqueUser, cleanupUsers;
let createApp;
let createApiKey;
let base;

before(async () => {
  ({ closePool } = await import('../../src/db/pool.js'));
  ({ uniqueUser, cleanupUsers } = await import('./helpers.js'));
  ({ createApiKey } = await import('../../src/services/apiKeys.service.js'));
  ({ createApp } = await import('../../src/app.js'));
  server = createApp({ rateLimit: false }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  await cleanupUsers(created);
  await closePool();
});

async function call(method, path, { bearer, cookie, body } = {}) {
  const headers = {};
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { res, json: text ? JSON.parse(text) : null };
}

async function account() {
  const user = uniqueUser();
  created.push(user.username);
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(user),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  const cookie = res.headers.getSetCookie()[0].split(';')[0];
  return { id: body.id, cookie };
}

describe('routes des clés', () => {
  it('crée, liste et révoque une clé par session', async () => {
    const { cookie } = await account();
    const created1 = await call('POST', '/api/keys', { cookie, body: { name: 'ma clé' } });
    assert.equal(created1.res.status, 201);
    assert.match(created1.json.key, /^trk_[A-Za-z0-9_-]{43}$/);

    const listed = await call('GET', '/api/keys', { cookie });
    assert.equal(listed.res.status, 200);
    assert.equal(listed.json.items.length, 1);
    assert.equal(listed.json.items[0].id, created1.json.id);
    assert.equal(listed.json.items[0].key, undefined);

    const removed = await call('DELETE', `/api/keys/${created1.json.id}`, { cookie });
    assert.equal(removed.res.status, 204);

    const after1 = await call('GET', '/api/keys', { cookie });
    assert.deepEqual(after1.json.items, []);
  });

  it('refuse de gérer les clés avec une clé', async () => {
    const { id, cookie } = await account();
    const apiKey = await createApiKey(id, 'test');
    for (const [method, path, body] of [
      ['GET', '/api/keys'],
      ['POST', '/api/keys', { name: 'autre' }],
      ['DELETE', `/api/keys/${apiKey.id}`],
    ]) {
      const { res } = await call(method, path, { bearer: apiKey.key, cookie, body });
      assert.equal(res.status, 403, `${method} ${path}`);
    }
  });

  it('refuse sans authentification', async () => {
    const { res } = await call('GET', '/api/keys');
    assert.equal(res.status, 401);
  });

  it("cache l'existence de la clé d'un autre", async () => {
    const owner = await account();
    const other = await account();
    const apiKey = await createApiKey(owner.id, 'privée');
    const foreign = await call('DELETE', `/api/keys/${apiKey.id}`, { cookie: other.cookie });
    assert.equal(foreign.res.status, 404);
    const unknown = await call('DELETE', '/api/keys/00000000-0000-4000-8000-000000000000', {
      cookie: other.cookie,
    });
    assert.equal(unknown.res.status, 404);
    const invalid = await call('DELETE', '/api/keys/pas-un-uuid', { cookie: other.cookie });
    assert.equal(invalid.res.status, 400);
  });

  it('refuse un nom vide ou trop long', async () => {
    const { cookie } = await account();
    for (const name of ['', 'x'.repeat(51)]) {
      const { res } = await call('POST', '/api/keys', { cookie, body: { name } });
      assert.equal(res.status, 400);
    }
  });

  it('répond 405 sur une méthode non permise', async () => {
    const { cookie } = await account();
    const { res } = await call('PUT', '/api/keys', { cookie });
    assert.equal(res.status, 405);
  });
});
