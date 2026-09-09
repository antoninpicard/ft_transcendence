import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { closePool } from '../src/db/pool.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';

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

const post = (body) =>
  fetch(`${base}/api/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

const SOME_UUID = '00000000-0000-4000-8000-000000000000';

describe('couche HTTP', () => {
  it("répond 404 en JSON sur une route inconnue", async () => {
    const res = await fetch(`${base}/api/nope`);
    assert.equal(res.status, 404);
    const { error } = await res.json();
    assert.match(error.message, /Route inconnue/);
  });

  it("n'annonce pas Express au client", async () => {
    const res = await fetch(`${base}/api/nope`);
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  it('rejette un corps invalide en 400 avec le détail des champs', async () => {
    const res = await post(JSON.stringify({ username: 'ab', email: 'nope' }));
    assert.equal(res.status, 400);
    const { error } = await res.json();
    assert.deepEqual(
      error.details.map((d) => d.path).sort(),
      ['email', 'username'],
    );
  });

  it('rejette un id qui n\'est pas un uuid en 400', async () => {
    const res = await fetch(`${base}/api/users/123`);
    assert.equal(res.status, 400);
  });

  it('rejette une query hors bornes en 400', async () => {
    const res = await fetch(`${base}/api/users?limit=999`);
    assert.equal(res.status, 400);
  });

  it('borne aussi offset, pour empêcher un dump par pagination', async () => {
    const res = await fetch(`${base}/api/users?offset=999999`);
    assert.equal(res.status, 400);
  });

  it('traite un JSON malformé en 400, pas en 500', async () => {
    const res = await post('{oops');
    assert.equal(res.status, 400);
    const { error } = await res.json();
    assert.equal(error.stack, undefined, 'aucune stack ne doit fuiter');
  });

  it('traite un corps trop volumineux en 413, pas en 500', async () => {
    const res = await post(JSON.stringify({ username: 'x'.repeat(200_000), email: 'a@b.fr' }));
    assert.equal(res.status, 413);
  });

  it('répond 405 avec un en-tête Allow sur une méthode non gérée', async () => {
    const res = await fetch(`${base}/api/users/${SOME_UUID}`, { method: 'PUT' });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET, PATCH, DELETE');
  });

  it("n'annonce jamais credentials quand l'origine est '*'", async () => {
    const res = await fetch(`${base}/api/nope`, { headers: { origin: 'https://evil.example' } });
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.equal(
      res.headers.get('access-control-allow-credentials'),
      null,
      "'*' avec credentials est refusé par les navigateurs",
    );
  });

  it('interdit la mise en cache des réponses de l\'API', async () => {
    const res = await fetch(`${base}/api/nope`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });
});

describe('gestion des erreurs', () => {
  function capture(err) {
    const res = {
      headersSent: false,
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    const silenced = console.error;
    console.error = () => {};
    try {
      errorHandler(err, { method: 'GET', originalUrl: '/api/users' }, res, () => {});
    } finally {
      console.error = silenced;
    }
    return res;
  }

  it("ne sérialise jamais la stack d'une erreur inconnue, quel que soit NODE_ENV", () => {
    const res = capture(new Error('détail interne à ne pas exposer'));
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error.message, 'Erreur interne du serveur');
    assert.equal(res.body.error.stack, undefined);
    assert.equal(JSON.stringify(res.body).includes('détail interne'), false);
  });

  it('délègue à Express si la réponse a déjà commencé', () => {
    const err = new Error('trop tard');
    let passed = null;
    const res = {
      headersSent: true,
      status() { throw new Error('ne doit pas être appelé'); },
      json() { throw new Error('ne doit pas être appelé'); },
    };
    const silenced = console.error;
    console.error = () => {};
    try {
      errorHandler(err, { method: 'GET', originalUrl: '/x' }, res, (e) => { passed = e; });
    } finally {
      console.error = silenced;
    }
    assert.equal(passed, err);
  });
});
