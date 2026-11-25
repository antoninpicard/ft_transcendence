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

async function put(id, body, { bearer, cookie } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${base}/api/users/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  return { res, json: await res.json() };
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
  return { user, id: body.id, cookie };
}

function fresh() {
  const u = uniqueUser();
  created.push(u.username);
  return { username: u.username, email: u.email };
}

describe('PUT /api/users/:id', () => {
  it('remplace pseudo et email par PUT', async () => {
    const { id, cookie } = await account();
    const next = fresh();
    const { res, json } = await put(id, next, { cookie });
    assert.equal(res.status, 200);
    assert.equal(json.username, next.username);
    assert.equal(json.email, next.email);

    const apiKey = await createApiKey(id, 'test');
    const again = fresh();
    const viaKey = await put(id, again, { bearer: apiKey.key });
    assert.equal(viaKey.res.status, 200);
    assert.equal(viaKey.json.username, again.username);
  });

  it('exige les deux champs pour PUT', async () => {
    const { id, cookie } = await account();
    const { res } = await put(id, { username: fresh().username }, { cookie });
    assert.equal(res.status, 400);
  });

  it("refuse un PUT sur le compte d'un autre", async () => {
    const me = await account();
    const other = await account();
    const { res } = await put(other.id, fresh(), { cookie: me.cookie });
    assert.equal(res.status, 403);
  });

  it('refuse un PUT sans authentification', async () => {
    const other = await account();
    const { res } = await put(other.id, fresh());
    assert.equal(res.status, 401);
  });

  it('signale un pseudo déjà pris en PUT', async () => {
    const me = await account();
    const other = await account();
    const { res } = await put(me.id, { username: other.user.username, email: fresh().email }, {
      cookie: me.cookie,
    });
    assert.equal(res.status, 409);
  });
});
