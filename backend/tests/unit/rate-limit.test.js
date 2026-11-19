import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';

const servers = [];

async function start(options) {
  const server = createApp(options).listen(0);
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise((resolve) => server.close(() => resolve())),
    ),
  );
});

const post = (base, path, body = {}, headers = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

async function statuses(base, path, count, body, headers) {
  const result = [];
  for (let i = 0; i < count; i += 1) {
    result.push((await post(base, path, body, headers)).status);
  }
  return result;
}

describe('limitation de débit', () => {
  it('limite la connexion à 10 par minute', async () => {
    const base = await start({ rateLimit: true });
    assert.deepEqual(await statuses(base, '/api/auth/login', 10), Array(10).fill(400));
    const res = await post(base, '/api/auth/login');
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.equal(typeof body.error.message, 'string');
  });

  it('compte les essais de connexion par identifiant', async () => {
    const base = await start({ rateLimit: true });
    const alice = { identifier: 'alice' };
    assert.deepEqual(await statuses(base, '/api/auth/login', 10, alice), Array(10).fill(400));
    assert.equal((await post(base, '/api/auth/login', { identifier: 'bob' })).status, 400);
    assert.equal((await post(base, '/api/auth/login')).status, 400);
    assert.equal((await post(base, '/api/auth/login', { identifier: '  ALICE ' })).status, 429);
  });

  it('compte les essais de connexion par adresse', async () => {
    const base = await start({ rateLimit: true });
    const alice = { identifier: 'alice' };
    const elsewhere = { 'x-forwarded-for': '203.0.113.9' };
    await statuses(base, '/api/auth/login', 10, alice);
    assert.equal((await post(base, '/api/auth/login', alice, elsewhere)).status, 400);
    assert.equal((await post(base, '/api/auth/login', alice)).status, 429);
  });

  it("limite l'inscription à 5 par minute", async () => {
    const base = await start({ rateLimit: true });
    assert.deepEqual(await statuses(base, '/api/auth/register', 5), Array(5).fill(400));
    assert.equal((await post(base, '/api/auth/register')).status, 429);
  });

  it('ne partage pas les compteurs entre la connexion et l\'inscription', async () => {
    const base = await start({ rateLimit: true });
    await statuses(base, '/api/auth/register', 6);
    assert.equal((await post(base, '/api/auth/login')).status, 400);
  });

  it('ne partage pas les compteurs entre deux instances', async () => {
    const first = await start({ rateLimit: true });
    await statuses(first, '/api/auth/register', 6);
    const second = await start({ rateLimit: true });
    assert.equal((await post(second, '/api/auth/register')).status, 400);
  });

  it('ne limite pas sans l\'option', async () => {
    const base = await start();
    assert.deepEqual(await statuses(base, '/api/auth/login', 11), Array(11).fill(400));
  });
});
