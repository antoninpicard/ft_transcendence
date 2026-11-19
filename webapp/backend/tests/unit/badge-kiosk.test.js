process.env.DEVICE_TOKEN = 'jeton-appareil-de-test';
process.env.BADGE_UID_SECRET = 'secret-uid-de-test-0123456789abcdef';
process.env.BADGE_LOGIN_ALLOWED_IPS = '127.0.0.1, ::ffff:10.0.0.7 , 2001:DB8::7';

import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { createApp } = await import('../../src/app.js');
const { closePool } = await import('../../src/db/pool.js');

const FOREIGN_IP = '203.0.113.9';
const servers = [];

function start() {
  const server = createApp().listen(0);
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(() => resolve()))),
  );
});

after(async () => {
  await closePool();
});

function call(base, method, path, { body, ip, device } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (ip) headers['x-forwarded-for'] = ip;
  if (device) headers['x-device-token'] = device;
  return fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('connexion par badge réservée à la borne', () => {
  it('ouvre une fenêtre de connexion depuis une adresse listée', async () => {
    const res = await call(start(), 'POST', '/api/badge/login');
    assert.equal(res.status, 200);
    assert.match((await res.json()).code, /^[0-9a-f]{32}$/);
  });

  it('reconnaît une adresse listée sous une autre écriture', async () => {
    for (const ip of ['10.0.0.7', '2001:db8:0:0:0:0:0:7']) {
      const res = await call(start(), 'POST', '/api/badge/login', { ip });
      assert.equal(res.status, 200, ip);
    }
  });

  it('refuse le démarrage depuis une adresse non listée', async () => {
    const res = await call(start(), 'POST', '/api/badge/login', { ip: FOREIGN_IP });
    assert.equal(res.status, 403);
    assert.equal(typeof (await res.json()).error.message, 'string');
  });

  it('refuse une adresse listée glissée en tête de X-Forwarded-For', async () => {
    const res = await call(start(), 'POST', '/api/badge/login', {
      ip: `127.0.0.1, ${FOREIGN_IP}`,
    });
    assert.equal(res.status, 403);
  });

  it('n ouvre aucune fenêtre quand l adresse est refusée', async () => {
    const base = start();
    assert.equal((await call(base, 'POST', '/api/badge/login', { ip: FOREIGN_IP })).status, 403);
    assert.equal((await call(base, 'POST', '/api/badge/login')).status, 200);
  });

  it('refuse la confirmation depuis une adresse non listée, avant la validation', async () => {
    const base = start();
    for (const body of [{ token: 'inconnu' }, {}]) {
      const res = await call(base, 'POST', '/api/badge/login/confirm', { body, ip: FOREIGN_IP });
      assert.equal(res.status, 403);
    }
  });

  it('laisse passer la confirmation depuis une adresse listée', async () => {
    const res = await call(start(), 'POST', '/api/badge/login/confirm', {
      body: { token: 'inconnu' },
    });
    assert.equal(res.status, 401);
  });

  it('ne restreint ni l appairage, ni le statut, ni la déliaison, ni l appareil', async () => {
    const base = start();
    const ip = FOREIGN_IP;
    assert.equal((await call(base, 'POST', '/api/badge/pairing', { ip })).status, 401);
    assert.equal((await call(base, 'GET', '/api/badge', { ip })).status, 401);
    assert.equal((await call(base, 'DELETE', '/api/badge', { ip })).status, 401);
    const hello = await call(base, 'POST', '/api/hello', {
      ip,
      body: { device: 'esp32-badge', status: 'online' },
      device: process.env.DEVICE_TOKEN,
    });
    assert.equal(hello.status, 200);
  });
});
