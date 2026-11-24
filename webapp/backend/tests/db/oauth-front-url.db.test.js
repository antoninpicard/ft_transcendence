import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const FRONT_URL = 'http://localhost:5173';
const suffix = randomBytes(5).toString('hex');
const profile = {
  id: Math.floor(Math.random() * 1_000_000_000) + 1_000_000,
  email: `front-${suffix}@example.test`,
  login: `ft${suffix}`,
};
let closePool;
let cleanupUsers;
let intra;
let server;
let base;

before(async () => {
  intra = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url === '/oauth/token') res.end(JSON.stringify({ access_token: 'jeton-de-test' }));
    else res.end(JSON.stringify(profile));
  });
  await new Promise((resolve) => intra.listen(0, '127.0.0.1', resolve));

  process.env.FORTYTWO_CLIENT_ID = 'client-id-test';
  process.env.FORTYTWO_CLIENT_SECRET = 'client-secret-test';
  process.env.FORTYTWO_REDIRECT_URI = 'http://localhost:3000/api/auth/42/callback';
  process.env.FORTYTWO_API_URL = `http://127.0.0.1:${intra.address().port}`;
  process.env.FRONT_URL = FRONT_URL;

  ({ closePool } = await import('../../src/db/pool.js'));
  ({ cleanupUsers } = await import('./helpers.js'));
  const { createApp } = await import('../../src/app.js');
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await cleanupUsers([profile.login]);
  intra.closeAllConnections();
  await new Promise((resolve) => intra.close(resolve));
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await closePool();
});

describe('FRONT_URL', () => {
  it('préfixe les redirections par FRONT_URL', async () => {
    const start = await fetch(`${base}/api/auth/42`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const ok = await fetch(`${base}/api/auth/42/callback?code=ok&state=${state}`, {
      redirect: 'manual',
      headers: { cookie: `oauth_state=${state}` },
    });
    assert.equal(ok.headers.get('location'), `${FRONT_URL}/home`);
    const bad = await fetch(`${base}/api/auth/42/callback?code=ok&state=faux`, { redirect: 'manual' });
    assert.equal(bad.headers.get('location'), `${FRONT_URL}/login?oauth_error=oauth_state`);
  });
});
