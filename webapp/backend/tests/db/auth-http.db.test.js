import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/db/pool.js';
import { uniqueUser, cleanupUsers } from './helpers.js';

const created = [];
let server;
let base;

before(() => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await cleanupUsers(created);
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await closePool();
});

function json(path, body, cookie) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function cookieOf(res) {
  return res.headers.get('set-cookie').split(';')[0];
}

async function signUp() {
  const user = uniqueUser();
  created.push(user.username);
  const res = await json('/api/auth/register', user);
  return { user, res, cookie: cookieOf(res) };
}

describe('inscription', () => {
  it('crée le compte et ouvre la session', async () => {
    const { user, res } = await signUp();
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.username, user.username);
    assert.equal(body.email, user.email);
    assert.equal('password' in body, false);
    assert.match(res.headers.get('set-cookie'), /^sid=/);
    assert.match(res.headers.get('set-cookie'), /HttpOnly/i);
  });

  it('refuse un mot de passe trop court', async () => {
    const res = await json('/api/auth/register', { ...uniqueUser(), password: 'court' });
    assert.equal(res.status, 400);
  });

  it('refuse un pseudo déjà pris', async () => {
    const { user } = await signUp();
    const res = await json('/api/auth/register', { ...uniqueUser(), username: user.username });
    assert.equal(res.status, 409);
  });
});

describe('connexion', () => {
  it('accepte email ou pseudo', async () => {
    const { user } = await signUp();
    for (const identifier of [user.email, user.username]) {
      const res = await json('/api/auth/login', { identifier, password: user.password });
      assert.equal(res.status, 200);
    }
  });

  it('renvoie 401 sans distinguer les deux échecs', async () => {
    const { user } = await signUp();
    const wrong = await json('/api/auth/login', { identifier: user.email, password: 'faux-mot-de-passe' });
    const unknown = await json('/api/auth/login', { identifier: 'absent@example.test', password: user.password });

    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(await wrong.json(), await unknown.json());
  });

  it('ne renvoie pas 400 sur un mot de passe court mais faux', async () => {
    const { user } = await signUp();
    const res = await json('/api/auth/login', { identifier: user.email, password: 'x' });
    assert.equal(res.status, 401);
  });
});

describe('session', () => {
  it('expose le compte courant', async () => {
    const { user, cookie } = await signUp();
    const res = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).email, user.email);
  });

  it('refuse me sans cookie', async () => {
    const res = await fetch(`${base}/api/auth/me`);
    assert.equal(res.status, 401);
  });

  it('refuse un cookie JSON préfixé sans planter', async () => {
    const res = await fetch(`${base}/api/auth/me`, { headers: { cookie: 'sid=j%3A%7B%7D' } });
    assert.equal(res.status, 401);
  });

  it('invalide la session à la déconnexion', async () => {
    const { cookie } = await signUp();
    const out = await json('/api/auth/logout', {}, cookie);
    assert.equal(out.status, 204);

    const res = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
    assert.equal(res.status, 401);
  });

  it('accepte une déconnexion sans session', async () => {
    const res = await json('/api/auth/logout', {});
    assert.equal(res.status, 204);
  });
});

describe('propriété du compte', () => {
  it('laisse modifier son propre compte', async () => {
    const { user, cookie } = await signUp();
    const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json();

    const res = await fetch(`${base}/api/users/${me.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ username: `${user.username}-b` }),
    });
    created.push(`${user.username}-b`);
    assert.equal(res.status, 200);
  });

  it('refuse de modifier le compte d un autre', async () => {
    const other = await signUp();
    const mine = await signUp();
    const target = await (await fetch(`${base}/api/auth/me`, { headers: { cookie: other.cookie } })).json();

    const res = await fetch(`${base}/api/users/${target.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: mine.cookie },
      body: JSON.stringify({ username: 'pirate' }),
    });
    assert.equal(res.status, 403);
  });

  it('laisse modifier son propre compte même avec un id en majuscules', async () => {
    const { user, cookie } = await signUp();
    const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json();

    const res = await fetch(`${base}/api/users/${me.id.toUpperCase()}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ username: `${user.username}-up` }),
    });
    created.push(`${user.username}-up`);
    assert.equal(res.status, 200);
  });

  it('refuse de supprimer sans session', async () => {
    const { cookie } = await signUp();
    const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json();
    const res = await fetch(`${base}/api/users/${me.id}`, { method: 'DELETE' });
    assert.equal(res.status, 401);
  });

  it('refuse de supprimer le compte d un autre', async () => {
    const other = await signUp();
    const mine = await signUp();
    const target = await (await fetch(`${base}/api/auth/me`, { headers: { cookie: other.cookie } })).json();

    const res = await fetch(`${base}/api/users/${target.id}`, {
      method: 'DELETE',
      headers: { cookie: mine.cookie },
    });
    assert.equal(res.status, 403);
  });

  it('supprime son propre compte et révoque ses sessions', async () => {
    const { cookie } = await signUp();
    const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json();

    const res = await fetch(`${base}/api/users/${me.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    assert.equal(res.status, 204);

    const after = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
    assert.equal(after.status, 401);
  });
});

describe('méthodes non gérées', () => {
  it('refuse POST /users avec 405', async () => {
    const res = await fetch(`${base}/api/users`, { method: 'POST' });
    assert.equal(res.status, 405);
  });
});

describe('projection publique HTTP', () => {
  it("n'expose pas l'email sur GET /users/:id", async () => {
    const { user, cookie } = await signUp();
    const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json();

    const res = await fetch(`${base}/api/users/${me.id}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.username, user.username);
    assert.equal('email' in body, false);
  });
});
