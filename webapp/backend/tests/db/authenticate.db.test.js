import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.DEVICE_TOKEN = 'jeton-appareil-de-test';
process.env.BADGE_UID_SECRET = 'secret-uid-de-test-0123456789abcdef';
process.env.BADGE_LOGIN_ALLOWED_IPS = '127.0.0.1';

const created = [];
const servers = [];
let closePool;
let uniqueUser, cleanupUsers;
let createApp;
let createApiKey, revokeApiKey;
let base;
let limitedBase;

before(async () => {
  ({ closePool } = await import('../../src/db/pool.js'));
  ({ uniqueUser, cleanupUsers } = await import('./helpers.js'));
  ({ createApiKey, revokeApiKey } = await import('../../src/services/apiKeys.service.js'));
  ({ createApp } = await import('../../src/app.js'));
  const plain = createApp({ rateLimit: false }).listen(0);
  const limited = createApp({ rateLimit: true }).listen(0);
  servers.push(plain, limited);
  base = `http://127.0.0.1:${plain.address().port}`;
  limitedBase = `http://127.0.0.1:${limited.address().port}`;
});

after(async () => {
  await Promise.all(
    servers.map((s) => new Promise((resolve, reject) => s.close((e) => (e ? reject(e) : resolve())))),
  );
  await cleanupUsers(created);
  await closePool();
});

async function call(method, path, { bearer, cookie, url = base } = {}) {
  const headers = {};
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${url}${path}`, { method, headers });
  const text = await res.text();
  return { res, json: text ? JSON.parse(text) : null };
}

async function account(url = base) {
  const user = uniqueUser();
  created.push(user.username);
  const res = await fetch(`${url}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(user),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  const cookie = res.headers.getSetCookie()[0].split(';')[0];
  const apiKey = await createApiKey(body.id, 'test');
  return { user, id: body.id, cookie, apiKey };
}

describe('authenticate', () => {
  it('authentifie par clé', async () => {
    const { user, apiKey } = await account();
    const { res, json } = await call('GET', '/api/auth/me', { bearer: apiKey.key });
    assert.equal(res.status, 200);
    assert.equal(json.email, user.email);
  });

  it('refuse une clé révoquée même avec un cookie valide', async () => {
    const { id, cookie, apiKey } = await account();
    assert.equal(await revokeApiKey(id, apiKey.id), true);
    const { res } = await call('GET', '/api/auth/me', { bearer: apiKey.key, cookie });
    assert.equal(res.status, 401);
  });

  it('refuse une clé bien formée mais inconnue', async () => {
    const { res } = await call('GET', '/api/auth/me', { bearer: `trk_${'A'.repeat(43)}` });
    assert.equal(res.status, 401);
  });

  it('refuse une clé mal formée avec un cookie valide', async () => {
    const { cookie } = await account();
    const { res } = await call('GET', '/api/auth/me', { bearer: 'abc', cookie });
    assert.equal(res.status, 401);
  });

  it('refuse un en-tête mal formé sur la déconnexion, mais pas un simple cookie', async () => {
    const { cookie } = await account();
    const bad = await call('POST', '/api/auth/logout', { bearer: 'abc', cookie });
    assert.equal(bad.res.status, 401);
    const ok = await call('POST', '/api/auth/logout', { cookie });
    assert.equal(ok.res.status, 204);
  });

  it('traite un cookie inconnu comme anonyme sur une route publique', async () => {
    const { res } = await call('GET', '/api/users', { cookie: `sid=${'0'.repeat(64)}` });
    assert.equal(res.status, 200);
  });

  it('refuse un cookie inconnu sur une route protégée', async () => {
    const { res } = await call('GET', '/api/auth/me', { cookie: `sid=${'0'.repeat(64)}` });
    assert.equal(res.status, 401);
  });

  it('refuse une clé sur la badgeuse', async () => {
    const { apiKey } = await account();
    const pairing = await call('POST', '/api/badge/pairing', { bearer: apiKey.key });
    assert.equal(pairing.res.status, 403);
    const status = await call('GET', '/api/badge', { bearer: apiKey.key });
    assert.equal(status.res.status, 403);
    const unlink = await call('DELETE', '/api/badge', { bearer: apiKey.key });
    assert.equal(unlink.res.status, 403);
  });

  it('accepte la session sur la badgeuse', async () => {
    const { cookie } = await account();
    const status = await call('GET', '/api/badge', { cookie });
    assert.equal(status.res.status, 200);
  });

  it('refuse une clé pour supprimer le compte', async () => {
    const { id, cookie, apiKey } = await account();
    const withKey = await call('DELETE', `/api/users/${id}`, { bearer: apiKey.key });
    assert.equal(withKey.res.status, 403);
    const withCookie = await call('DELETE', `/api/users/${id}`, { cookie });
    assert.equal(withCookie.res.status, 204);
  });

  it('refuse la suppression du compte avec une clé valide et un cookie valide', async () => {
    const { id, cookie, apiKey } = await account();
    const both = await call('DELETE', `/api/users/${id}`, { bearer: apiKey.key, cookie });
    assert.equal(both.res.status, 403);
    const stillThere = await call('GET', '/api/auth/me', { cookie });
    assert.equal(stillThere.res.status, 200);
  });

  it('limite une clé à 60 requêtes par minute', async () => {
    const { apiKey } = await account(limitedBase);
    for (let i = 0; i < 60; i += 1) {
      const { res } = await call('GET', '/api/auth/me', { bearer: apiKey.key, url: limitedBase });
      assert.equal(res.status, 200, `requête ${i + 1}`);
    }
    const { res } = await call('GET', '/api/auth/me', { bearer: apiKey.key, url: limitedBase });
    assert.equal(res.status, 429);
  });

  it('ne limite pas les requêtes par session avec ce compteur', async () => {
    const { cookie } = await account(limitedBase);
    for (let i = 0; i < 61; i += 1) {
      const { res } = await call('GET', '/api/auth/me', { cookie, url: limitedBase });
      assert.equal(res.status, 200, `requête ${i + 1}`);
    }
  });
});
