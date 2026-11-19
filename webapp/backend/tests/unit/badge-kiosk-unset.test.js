process.env.DEVICE_TOKEN = 'jeton-appareil-de-test';
process.env.BADGE_UID_SECRET = 'secret-uid-de-test-0123456789abcdef';
delete process.env.BADGE_LOGIN_ALLOWED_IPS;

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { createApp } = await import('../../src/app.js');
const { closePool } = await import('../../src/db/pool.js');

let server;
let base;

before(() => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(() => resolve()));
  await closePool();
});

function post(path, body) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

describe('connexion par badge sans liste d adresses', () => {
  it('répond 503 au démarrage de la connexion par badge', async () => {
    assert.equal((await post('/api/badge/login')).status, 503);
  });

  it('répond 503 à la confirmation', async () => {
    assert.equal((await post('/api/badge/login/confirm', { token: 'inconnu' })).status, 503);
  });

  it('laisse l appairage et l appareil en service', async () => {
    assert.equal((await post('/api/badge/pairing')).status, 401);
    const hello = await fetch(`${base}/api/hello`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-device-token': process.env.DEVICE_TOKEN,
      },
      body: JSON.stringify({ device: 'esp32-badge', status: 'online' }),
    });
    assert.equal(hello.status, 200);
  });
});
