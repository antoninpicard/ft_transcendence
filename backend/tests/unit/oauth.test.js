import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/db/pool.js';

let server;
let base;

before(() => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await closePool();
});

describe('OAuth 42 non configuré', () => {
  it('répond 503 au démarrage de la connexion', async () => {
    const res = await fetch(`${base}/api/auth/42`, { redirect: 'manual' });
    assert.equal(res.status, 503);
  });

  it('répond 503 au callback', async () => {
    const res = await fetch(`${base}/api/auth/42/callback?code=x&state=y`, { redirect: 'manual' });
    assert.equal(res.status, 503);
  });
});
