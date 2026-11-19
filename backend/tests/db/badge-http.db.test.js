process.env.DEVICE_TOKEN = 'jeton-appareil-de-test';
process.env.BADGE_UID_SECRET = 'secret-uid-de-test-0123456789abcdef';
process.env.BADGE_LOGIN_ALLOWED_IPS = '127.0.0.1';

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const DEVICE_TOKEN = process.env.DEVICE_TOKEN;
const created = [];
let closePool;
let uniqueUser, cleanupUsers;
let hashBadgeUid;
let createApp;
let app;
let server;
let base;
const bodies = [];

before(async () => {
  ({ closePool } = await import('../../src/db/pool.js'));
  ({ uniqueUser, cleanupUsers } = await import('./helpers.js'));
  ({ hashBadgeUid } = await import('../../src/services/badgeUid.js'));
  ({ createApp } = await import('../../src/app.js'));
  app = createApp();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await cleanupUsers(created);
  await closePool();
});

function randomUid() {
  return randomBytes(7).toString('hex').toUpperCase();
}

async function call(method, path, { body, cookie, device, ip, url = base } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  if (device) headers['x-device-token'] = device;
  if (ip) headers['x-forwarded-for'] = ip;
  const res = await fetch(`${url}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  bodies.push(text);
  return { res, text, json: text ? JSON.parse(text) : null };
}

async function register() {
  const user = uniqueUser();
  created.push(user.username);
  const { res } = await call('POST', '/api/auth/register', { body: user });
  assert.equal(res.status, 201);
  return res.headers.getSetCookie()[0].split(';')[0];
}

function scan(uid) {
  return call('POST', '/api/scan', { body: { uid }, device: DEVICE_TOKEN });
}

async function link(cookie, uid) {
  const { res, json } = await call('POST', '/api/badge/pairing', { cookie });
  assert.equal(res.status, 200);
  const result = await scan(uid);
  assert.equal(result.res.status, 200);
  return json.code;
}

describe('routes de la badgeuse', () => {
  it('accepte le bonjour de l appareil', async () => {
    const { res, json } = await call('POST', '/api/hello', {
      body: { device: 'esp32-badge', status: 'online' },
      device: DEVICE_TOKEN,
    });
    assert.equal(res.status, 200);
    assert.equal(typeof json.message, 'string');
  });

  it('refuse un jeton d appareil faux ou absent', async () => {
    for (const device of [undefined, 'mauvais']) {
      const hello = await call('POST', '/api/hello', { body: {}, device });
      assert.equal(hello.res.status, 401);
      const sc = await call('POST', '/api/scan', { body: { uid: 'AABBCCDD' }, device });
      assert.equal(sc.res.status, 401);
    }
  });

  it('répond 200 à un scan sans action', async () => {
    const { res, json } = await scan(randomUid());
    assert.equal(res.status, 200);
    assert.equal(typeof json.message, 'string');
  });

  it('refuse un UID malformé', async () => {
    for (const uid of ['zz', { a: 1 }]) {
      const { res } = await call('POST', '/api/scan', { body: { uid }, device: DEVICE_TOKEN });
      assert.equal(res.status, 400);
    }
  });

  it('lie un badge depuis les réglages', async () => {
    const cookie = await register();
    const { res, json } = await call('POST', '/api/badge/pairing', { cookie });
    assert.equal(res.status, 200);
    assert.match(json.code, /^[0-9a-f]{32}$/);
    assert.equal((await scan(randomUid())).res.status, 200);
    const state = await call('GET', '/api/badge', { cookie });
    assert.deepEqual(state.json, { linked: true });
  });

  it('refuse l appairage sans session', async () => {
    const { res } = await call('POST', '/api/badge/pairing');
    assert.equal(res.status, 401);
  });

  it('délie le badge', async () => {
    const cookie = await register();
    await link(cookie, randomUid());
    const del = await call('DELETE', '/api/badge', { cookie });
    assert.equal(del.res.status, 204);
    const state = await call('GET', '/api/badge', { cookie });
    assert.deepEqual(state.json, { linked: false });
  });

  it('connecte par badge de bout en bout', async () => {
    const cookie = await register();
    const uid = randomUid();
    await link(cookie, uid);

    const start = await call('POST', '/api/badge/login');
    assert.equal(start.res.status, 200);
    const received = [];
    let closed = false;
    app.locals.badgeActions.attachSocket(start.json.code, {
      send: (msg) => received.push(JSON.parse(msg)),
      close: () => {
        closed = true;
      },
    });
    assert.equal((await scan(uid)).res.status, 200);
    assert.equal(received.length, 1);
    assert.equal(received[0].status, 'login-ready');
    assert.equal(closed, true);

    const confirm = await call('POST', '/api/badge/login/confirm', {
      body: { token: received[0].token },
    });
    assert.equal(confirm.res.status, 200);
    const sid = confirm.res.headers.getSetCookie().find((c) => c.startsWith('sid='));
    assert.ok(sid);
    const me = await call('GET', '/api/auth/me', { cookie: sid.split(';')[0] });
    assert.equal(me.res.status, 200);
    assert.equal(me.json.id, confirm.json.id);
  });

  it('refuse un jeton de confirmation invalide ou réutilisé', async () => {
    const invalid = await call('POST', '/api/badge/login/confirm', { body: { token: 'inconnu' } });
    assert.equal(invalid.res.status, 401);

    const cookie = await register();
    const uid = randomUid();
    await link(cookie, uid);
    const start = await call('POST', '/api/badge/login');
    const received = [];
    app.locals.badgeActions.attachSocket(start.json.code, {
      send: (msg) => received.push(JSON.parse(msg)),
      close: () => {},
    });
    await scan(uid);
    const token = received[0].token;
    assert.equal((await call('POST', '/api/badge/login/confirm', { body: { token } })).res.status, 200);
    assert.equal((await call('POST', '/api/badge/login/confirm', { body: { token } })).res.status, 401);

    const bad = await call('POST', '/api/badge/login/confirm', { body: { token: { a: 1 } } });
    assert.equal(bad.res.status, 400);
  });

  it('refuse la confirmation hors de la borne même avec un jeton valide', async () => {
    const cookie = await register();
    const uid = randomUid();
    await link(cookie, uid);
    const start = await call('POST', '/api/badge/login');
    assert.equal(start.res.status, 200);
    const received = [];
    app.locals.badgeActions.attachSocket(start.json.code, {
      send: (msg) => received.push(JSON.parse(msg)),
      close: () => {},
    });
    await scan(uid);
    const { token } = received[0];

    const foreign = await call('POST', '/api/badge/login/confirm', {
      body: { token },
      ip: '203.0.113.9',
    });
    assert.equal(foreign.res.status, 403);
    assert.equal(foreign.res.headers.getSetCookie().length, 0);

    const kiosk = await call('POST', '/api/badge/login/confirm', { body: { token } });
    assert.equal(kiosk.res.status, 200);
  });

  it('refuse le démarrage d une connexion par badge hors de la borne', async () => {
    const { res } = await call('POST', '/api/badge/login', { ip: '203.0.113.9' });
    assert.equal(res.status, 403);
  });

  it('ne renvoie jamais l UID ni son hash', async () => {
    const uid = randomUid();
    const hashHex = hashBadgeUid(uid, process.env.BADGE_UID_SECRET).toString('hex');
    const cookie = await register();
    const before = bodies.length;
    await link(cookie, uid);
    await call('GET', '/api/badge', { cookie });
    await scan(uid);
    const joined = bodies.slice(before).join('\n').toLowerCase();
    assert.equal(joined.includes(uid.toLowerCase()), false);
    assert.equal(joined.includes(hashHex), false);
    assert.equal(bodies.join('\n').toLowerCase().includes(hashHex), false);
  });

  it('limite le démarrage d une connexion par badge', async () => {
    const limited = createApp({ rateLimit: true }).listen(0);
    const url = `http://127.0.0.1:${limited.address().port}`;
    try {
      const first = await call('POST', '/api/badge/login', { url });
      assert.equal(first.res.status, 200);
      const second = await call('POST', '/api/badge/login', { url });
      assert.equal(second.res.status, 429);
    } finally {
      await new Promise((resolve) => limited.close(resolve));
    }
  });
});
