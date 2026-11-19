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

const post = (base, path) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });

async function statuses(base, path, count) {
  const result = [];
  for (let i = 0; i < count; i += 1) {
    result.push((await post(base, path)).status);
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
