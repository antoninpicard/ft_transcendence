import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';

let server;
let base;

before(() => {
  server = createApp({ rateLimit: false }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(() => resolve())));

const get = (path, headers = {}) => fetch(`${base}${path}`, { headers });

describe('authenticate', () => {
  it('refuse un en-tête Authorization mal formé, même sur une route publique', async () => {
    const wellFormedShape = `trk_${'a'.repeat(43)}`;
    const values = [
      'Bearer abc',
      'Basic xyz',
      '',
      'Bearer',
      'Bearer ',
      `bearer ${wellFormedShape}`,
      `Bearer  ${wellFormedShape}`,
      wellFormedShape,
    ];
    for (const value of values) {
      const res = await get('/api/users', { authorization: value });
      assert.equal(res.status, 401, JSON.stringify(value));
      assert.equal(res.headers.get('cache-control'), 'no-store');
    }
  });

  it('refuse un en-tête mal formé sur la déconnexion', async () => {
    const res = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { authorization: 'Bearer abc' },
    });
    assert.equal(res.status, 401);
  });

  it('laisse passer une requête anonyme sur une route publique', async () => {
    const res = await get('/api/users/not-a-uuid');
    assert.equal(res.status, 400);
  });

  it('traite un cookie décodé en objet comme anonyme', async () => {
    const res = await get('/api/users/not-a-uuid', { cookie: 'sid=j:{}' });
    assert.equal(res.status, 400);
  });

  it('refuse une route protégée sans identifiants', async () => {
    const res = await get('/api/auth/me');
    assert.equal(res.status, 401);
  });
});
