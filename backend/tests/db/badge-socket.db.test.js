process.env.DEVICE_TOKEN = 'jeton-appareil-de-test';
process.env.BADGE_UID_SECRET = 'secret-uid-de-test-0123456789abcdef';
process.env.BADGE_LOGIN_ALLOWED_IPS = '127.0.0.1';

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { WebSocket } from 'ws';

const DEVICE_TOKEN = process.env.DEVICE_TOKEN;
const created = [];
const clients = [];
const extraServers = [];
let closePool;
let uniqueUser, cleanupUsers;
let createApp, attachBadgeSocket;
let app;
let server;
let wss;
let base;

before(async () => {
  ({ closePool } = await import('../../src/db/pool.js'));
  ({ uniqueUser, cleanupUsers } = await import('./helpers.js'));
  ({ createApp } = await import('../../src/app.js'));
  ({ attachBadgeSocket } = await import('../../src/realtime/badgeSocket.js'));
  app = createApp();
  server = app.listen(0);
  wss = attachBadgeSocket(server, app.locals.badgeActions);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  for (const client of clients) client.terminate();
  for (const extra of extraServers) {
    extra.wss.close();
    await new Promise((resolve) => extra.server.close(resolve));
  }
  wss.close();
  server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await cleanupUsers(created);
  await closePool();
});

function randomUid() {
  return randomBytes(7).toString('hex').toUpperCase();
}

async function call(method, path, { body, cookie, device } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  if (device) headers['x-device-token'] = device;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { res, json: text ? JSON.parse(text) : null };
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
  const { res } = await call('POST', '/api/badge/pairing', { cookie });
  assert.equal(res.status, 200);
  const result = await scan(uid);
  assert.equal(result.res.status, 200);
}

async function open(url = `ws://127.0.0.1:${server.address().port}/ws`) {
  const client = new WebSocket(url);
  clients.push(client);
  await once(client, 'open');
  return client;
}

function nextMessage(client) {
  return new Promise((resolve, reject) => {
    client.once('message', (data) => resolve(JSON.parse(data.toString())));
    client.once('close', () => reject(new Error('socket fermée sans message')));
  });
}

async function expectClosed(client, ms = 2000) {
  let fallback = false;
  if (client.readyState !== WebSocket.CLOSED) {
    const timer = setTimeout(() => {
      fallback = true;
      client.terminate();
    }, ms);
    await once(client, 'close');
    clearTimeout(timer);
  }
  assert.equal(fallback, false, 'le serveur n a pas fermé la socket');
  assert.equal(client.readyState, WebSocket.CLOSED);
}

function closeCode(client) {
  return new Promise((resolve) => client.once('close', (code) => resolve(code)));
}

describe('websocket de la badgeuse', () => {
  it('connecte par badge de bout en bout', async () => {
    const uid = randomUid();
    await link(await register(), uid);

    const client = await open();
    const { json } = await call('POST', '/api/badge/login');
    const message = nextMessage(client);
    client.send(JSON.stringify({ code: json.code }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await scan(uid);
    const result = await message;
    assert.equal(result.status, 'login-ready');
    assert.equal(typeof result.token, 'string');
    await expectClosed(client);

    const confirm = await call('POST', '/api/badge/login/confirm', { body: { token: result.token } });
    assert.equal(confirm.res.status, 200);
    const sid = confirm.res.headers.getSetCookie()[0].split(';')[0];
    const me = await call('GET', '/api/auth/me', { cookie: sid });
    assert.equal(me.res.status, 200);
  });

  it('livre un résultat arrivé avant la socket', async () => {
    const uid = randomUid();
    await link(await register(), uid);

    const { json } = await call('POST', '/api/badge/login');
    await scan(uid);

    const client = await open();
    const message = nextMessage(client);
    client.send(JSON.stringify({ code: json.code }));
    const result = await message;
    assert.equal(result.status, 'login-ready');
    await expectClosed(client);
  });

  it('notifie un appairage', async () => {
    const cookie = await register();
    const { json } = await call('POST', '/api/badge/pairing', { cookie });
    const client = await open();
    const message = nextMessage(client);
    client.send(JSON.stringify({ code: json.code }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await scan(randomUid());
    const result = await message;
    assert.equal(result.status, 'paired');
    await expectClosed(client);
  });

  it('ferme une socket qui envoie du texte invalide', async () => {
    const client = await open();
    client.send('pas du json');
    await expectClosed(client);
  });

  it('ferme une socket sans code', async () => {
    const client = await open();
    client.send(JSON.stringify({}));
    await expectClosed(client);
  });

  it('ferme une socket au message trop gros', async () => {
    const client = await open();
    const code = closeCode(client);
    client.send(JSON.stringify({ code: 'a'.repeat(2048) }));
    await expectClosed(client);
    assert.equal(await code, 1009);
  });

  it('ferme une socket qui envoie un code inconnu', async () => {
    const client = await open();
    client.send(JSON.stringify({ code: 'inconnu' }));
    await expectClosed(client);
  });

  it('reste disponible après des sockets invalides', async () => {
    const { res } = await call('GET', '/api/health');
    assert.equal(res.status, 200);
  });

  it('ferme une socket sans premier message', async () => {
    const extra = await startExtra({ handshakeTimeoutMs: 100 });
    const client = await open(extra.url);
    const started = Date.now();
    await expectClosed(client);
    assert.ok(Date.now() - started < 1500);
  });

  it('plafonne la durée de vie d une socket en attente', async () => {
    const extra = await startExtra({ maxLifetimeMs: 200 });
    const cookie = await register();
    const { json } = await call('POST', '/api/badge/pairing', { cookie });
    const client = await open(extra.url);
    client.send(JSON.stringify({ code: json.code }));
    const started = Date.now();
    await expectClosed(client);
    assert.ok(Date.now() - started < 1500);
  });
});

async function startExtra(options) {
  const extraApp = createApp();
  const extraServer = extraApp.listen(0);
  const extraWss = attachBadgeSocket(extraServer, app.locals.badgeActions, options);
  extraServers.push({ server: extraServer, wss: extraWss });
  await once(extraServer, 'listening');
  return { url: `ws://127.0.0.1:${extraServer.address().port}/ws` };
}
