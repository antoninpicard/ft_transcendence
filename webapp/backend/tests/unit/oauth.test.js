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

  it('redirige le callback vers oauth_unavailable sans journaliser le code', async () => {
    const logged = [];
    const original = console.error;
    console.error = (...args) => logged.push(args.map(String).join(' '));
    let res;
    try {
      res = await fetch(`${base}/api/auth/42/callback?code=code-secret-du-test&state=y`, {
        redirect: 'manual',
        headers: { cookie: 'oauth_state=y' },
      });
    } finally {
      console.error = original;
    }
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/login?oauth_error=oauth_unavailable');
    const cleared = res.headers.getSetCookie().find((c) => c.startsWith('oauth_state='));
    assert.match(cleared, /oauth_state=;/);
    assert.equal(logged.some((line) => line.includes('code-secret-du-test')), false);
  });
});
