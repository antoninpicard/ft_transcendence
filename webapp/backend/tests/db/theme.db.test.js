import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const created = [];
let server;
let closePool;
let uniqueUser, cleanupUsers;
let createApp;
let base;

before(async () => {
  ({ closePool } = await import('../../src/db/pool.js'));
  ({ uniqueUser, cleanupUsers } = await import('./helpers.js'));
  ({ createApp } = await import('../../src/app.js'));
  server = createApp({ rateLimit: false }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  await cleanupUsers(created);
  await closePool();
});

async function call(method, path, { cookie, body } = {}) {
  const headers = {};
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
  const { res, json } = await call('POST', '/api/auth/register', { body: user });
  assert.equal(res.status, 201);
  return { ...json, cookie: res.headers.getSetCookie()[0].split(';')[0] };
}

describe('thème du front', () => {
  it('vaut "auto" à la création du compte', async () => {
    const a = await account();
    assert.equal(a.theme, 'auto');
    assert.equal((await call('GET', '/api/auth/session', { cookie: a.cookie })).json.user.theme, 'auto');
  });

  it('se change avec PATCH et reste dans le profil privé', async () => {
    const a = await account();
    const { res, json } = await call('PATCH', `/api/users/${a.id}`, { cookie: a.cookie, body: { theme: 'chocolat' } });
    assert.equal(res.status, 200);
    assert.equal(json.theme, 'chocolat');
    assert.equal(json.username, a.username);
    assert.equal((await call('GET', '/api/auth/me', { cookie: a.cookie })).json.theme, 'chocolat');
  });

  it('PUT ne touche pas au thème', async () => {
    const a = await account();
    await call('PATCH', `/api/users/${a.id}`, { cookie: a.cookie, body: { theme: 'casino' } });
    const { json } = await call('PUT', `/api/users/${a.id}`, {
      cookie: a.cookie,
      body: { username: a.username, email: a.email, theme: 'menthe' },
    });
    assert.equal(json.theme, 'casino');
  });

  it("refuse un thème mal formé et celui d'un autre compte", async () => {
    const a = await account();
    const b = await account();
    for (const theme of ['', 'Chocolat', 'a b', '<script>', 'x'.repeat(31), 42]) {
      const { res } = await call('PATCH', `/api/users/${a.id}`, { cookie: a.cookie, body: { theme } });
      assert.equal(res.status, 400, JSON.stringify(theme));
    }
    const { res } = await call('PATCH', `/api/users/${b.id}`, { cookie: a.cookie, body: { theme: 'casino' } });
    assert.equal(res.status, 403);
  });

  it("n'apparaît pas dans le profil public", async () => {
    const a = await account();
    const { json } = await call('GET', `/api/users/${a.id}`);
    assert.equal(json.theme, undefined);
  });
});
