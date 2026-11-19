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

function post(path, body) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

describe('badgeuse non configurée', () => {
  it('répond 503 au bonjour de l appareil', async () => {
    assert.equal((await post('/api/hello', { device: 'esp32-badge', status: 'online' })).status, 503);
  });

  it('répond 503 au scan', async () => {
    assert.equal((await post('/api/scan', { uid: 'AABBCCDD' })).status, 503);
  });

  it('répond 503 au démarrage de la connexion par badge', async () => {
    assert.equal((await post('/api/badge/login')).status, 503);
  });

  it('répond 503 à la consultation du badge', async () => {
    assert.equal((await fetch(`${base}/api/badge`)).status, 503);
  });

  it('répond 503 au démarrage d un appairage', async () => {
    assert.equal((await post('/api/badge/pairing')).status, 503);
  });

  it('répond 503 à la confirmation de la connexion par badge', async () => {
    assert.equal((await post('/api/badge/login/confirm', { token: 'inconnu' })).status, 503);
  });

  it('répond 503 à la déliaison du badge', async () => {
    assert.equal((await fetch(`${base}/api/badge`, { method: 'DELETE' })).status, 503);
  });
});
