import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const created = [];
let server;
let limitedServer;
let closePool;
let query;
let uniqueUser, cleanupUsers;
let createApp;
let createApiKey;
let base;
let limitedBase;

before(async () => {
  ({ closePool, query } = await import('../../src/db/pool.js'));
  ({ uniqueUser, cleanupUsers } = await import('./helpers.js'));
  ({ createApiKey } = await import('../../src/services/apiKeys.service.js'));
  ({ createApp } = await import('../../src/app.js'));
  server = createApp({ rateLimit: false }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  limitedServer = createApp({ rateLimit: true }).listen(0);
  limitedBase = `http://127.0.0.1:${limitedServer.address().port}`;
});

after(async () => {
  for (const s of [server, limitedServer]) {
    await new Promise((resolve, reject) => s.close((e) => (e ? reject(e) : resolve())));
  }
  await cleanupUsers(created);
  await closePool();
});

async function call(method, path, { bearer, cookie, body, url = base } = {}) {
  const headers = {};
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${url}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { res, json: text ? JSON.parse(text) : null };
}

async function account(url = base) {
  const user = uniqueUser();
  created.push(user.username);
  const res = await fetch(`${url}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(user),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  const cookie = res.headers.getSetCookie()[0].split(';')[0];
  return { id: body.id, username: user.username, cookie };
}

async function befriend(a, b, url = base) {
  await call('POST', '/api/friends/requests', { url, cookie: a.cookie, body: { userId: b.id } });
  await call('POST', `/api/friends/requests/${a.id}/accept`, { url, cookie: b.cookie });
}

function send(from, to, body, extra = {}) {
  return call('POST', `/api/messages/${to.id}`, { cookie: from.cookie, body: { body }, ...extra });
}

async function friends() {
  const a = await account();
  const b = await account();
  await befriend(a, b);
  return { a, b };
}

describe('messages directs', () => {
  it('échange des messages entre amis', async () => {
    const { a, b } = await friends();
    const sent = await send(a, b, 'salut');
    assert.equal(sent.res.status, 201);
    assert.deepEqual(Object.keys(sent.json).sort(), [
      'body',
      'createdAt',
      'id',
      'recipientId',
      'senderId',
    ]);
    assert.equal(sent.json.senderId, a.id);
    assert.equal(sent.json.recipientId, b.id);
    assert.equal(sent.json.body, 'salut');

    for (const [me, other] of [
      [a, b],
      [b, a],
    ]) {
      const got = await call('GET', `/api/messages/${other.id}`, { cookie: me.cookie });
      assert.equal(got.res.status, 200);
      assert.deepEqual(got.json.items, [sent.json]);
    }
  });

  it('fonctionne avec une clé d API', async () => {
    const { a, b } = await friends();
    const { key } = await createApiKey(a.id, 'test');
    const sent = await call('POST', `/api/messages/${b.id}`, { bearer: key, body: { body: 'clé' } });
    assert.equal(sent.res.status, 201);
    const got = await call('GET', '/api/messages', { bearer: key });
    assert.equal(got.json.items.length, 1);
  });

  it('exige une authentification', async () => {
    const { b } = await friends();
    assert.equal((await call('GET', '/api/messages')).res.status, 401);
    assert.equal((await call('GET', `/api/messages/${b.id}`)).res.status, 401);
    assert.equal(
      (await call('POST', `/api/messages/${b.id}`, { body: { body: 'x' } })).res.status,
      401,
    );
  });

  it('refuse les méthodes non prévues', async () => {
    const { a, b } = await friends();
    const one = await call('DELETE', `/api/messages/${b.id}`, { cookie: a.cookie });
    assert.equal(one.res.status, 405);
    assert.equal(one.res.headers.get('allow'), 'GET, POST');
    const all = await call('POST', '/api/messages', { cookie: a.cookie, body: {} });
    assert.equal(all.res.status, 405);
    assert.equal(all.res.headers.get('allow'), 'GET');
  });

  it('refuse un message à un non-ami', async () => {
    const a = await account();
    const b = await account();
    assert.equal((await send(a, b, 'salut')).res.status, 403);
    assert.equal((await send(a, a, 'moi')).res.status, 400);
    const unknown = await call('POST', '/api/messages/00000000-0000-4000-8000-000000000000', {
      cookie: a.cookie,
      body: { body: 'salut' },
    });
    assert.equal(unknown.res.status, 404);
    const invalid = await call('POST', '/api/messages/pas-un-uuid', {
      cookie: a.cookie,
      body: { body: 'salut' },
    });
    assert.equal(invalid.res.status, 400);
    const { rows } = await query('SELECT 1 FROM messages WHERE sender_id = $1', [a.id]);
    assert.equal(rows.length, 0);
  });

  it('refuse un message vide ou fait d espaces', async () => {
    const { a, b } = await friends();
    assert.equal((await send(a, b, '')).res.status, 400);
    assert.equal((await send(a, b, '   ')).res.status, 400);
    assert.equal((await send(a, b, '\n\t ')).res.status, 400);
    const { rows } = await query('SELECT 1 FROM messages WHERE sender_id = $1', [a.id]);
    assert.equal(rows.length, 0);
  });

  it('refuse un message trop long', async () => {
    const { a, b } = await friends();
    assert.equal((await send(a, b, 'x'.repeat(2001))).res.status, 400);
    assert.equal((await send(a, b, 'x'.repeat(2000))).res.status, 201);
  });

  it('garde l historique lisible après une rupture', async () => {
    const { a, b } = await friends();
    await send(a, b, 'avant');
    await call('DELETE', `/api/friends/${b.id}`, { cookie: a.cookie });
    const got = await call('GET', `/api/messages/${b.id}`, { cookie: a.cookie });
    assert.equal(got.res.status, 200);
    assert.equal(got.json.items.length, 1);
    assert.equal((await send(a, b, 'après')).res.status, 403);
    assert.equal((await send(b, a, 'après')).res.status, 403);
  });

  it('ne montre pas la conversation des autres', async () => {
    const { a, b } = await friends();
    const c = await account();
    await send(a, b, 'secret');
    const got = await call('GET', `/api/messages/${b.id}`, { cookie: c.cookie });
    assert.equal(got.res.status, 200);
    assert.deepEqual(got.json.items, []);
    const list = await call('GET', '/api/messages', { cookie: c.cookie });
    assert.deepEqual(list.json.items, []);
  });

  it('liste les conversations du plus récent au plus ancien', async () => {
    const a = await account();
    const b = await account();
    const c = await account();
    await befriend(a, b);
    await befriend(a, c);
    await send(a, b, 'à b 1');
    await send(a, c, 'à c 1');
    const last = await send(b, a, 'de b 2');

    const list = await call('GET', '/api/messages', { cookie: a.cookie });
    assert.equal(list.res.status, 200);
    assert.equal(list.json.items.length, 2);
    assert.equal(list.json.items[0].user.id, b.id);
    assert.deepEqual(Object.keys(list.json.items[0].user).sort(), ['createdAt', 'id', 'username']);
    assert.deepEqual(list.json.items[0].lastMessage, last.json);
    assert.equal(list.json.items[1].user.id, c.id);
    assert.equal(list.json.items[1].lastMessage.body, 'à c 1');

    const other = await call('GET', '/api/messages', { cookie: b.cookie });
    assert.equal(other.json.items.length, 1);
    assert.equal(other.json.items[0].user.id, a.id);
  });

  it('pagine avec after et before', async () => {
    const { a, b } = await friends();
    const sent = [];
    for (let i = 1; i <= 5; i += 1) sent.push((await send(a, b, `m${i}`)).json);
    const bodies = (r) => r.json.items.map((m) => m.body);
    const get = (qs) => call('GET', `/api/messages/${b.id}?${qs}`, { cookie: a.cookie });

    assert.deepEqual(bodies(await get('limit=2')), ['m4', 'm5']);
    assert.deepEqual(bodies(await get('')), ['m1', 'm2', 'm3', 'm4', 'm5']);
    assert.deepEqual(bodies(await get(`after=${sent[0].id}&limit=2`)), ['m2', 'm3']);
    assert.deepEqual(bodies(await get(`after=${sent[4].id}`)), []);
    assert.deepEqual(bodies(await get(`before=${sent[4].id}&limit=2`)), ['m3', 'm4']);
    assert.deepEqual(bodies(await get(`before=${sent[0].id}`)), []);
    assert.equal((await get('limit=0')).res.status, 400);
    assert.equal((await get('limit=101')).res.status, 400);
  });

  it('garde un ordre stable quand les dates sont égales', async () => {
    const { a, b } = await friends();
    await query(
      `INSERT INTO messages (sender_id, recipient_id, body, created_at)
       SELECT $1, $2, 'm' || n, '2026-01-01T00:00:00Z' FROM generate_series(1, 5) n`,
      [a.id, b.id],
    );
    const all = await call('GET', `/api/messages/${b.id}`, { cookie: a.cookie });
    const ids = all.json.items.map((m) => m.id);
    assert.equal(ids.length, 5);
    const walked = [];
    let cursor = null;
    for (;;) {
      const qs = cursor ? `?after=${cursor}&limit=2` : '?limit=100';
      const page = await call('GET', `/api/messages/${b.id}${qs}`, { cookie: a.cookie });
      if (page.json.items.length === 0) break;
      walked.push(...page.json.items.map((m) => m.id));
      cursor = page.json.items.at(-1).id;
      if (walked.length > 5) break;
    }
    assert.deepEqual(walked, ids);
    const back = await call('GET', `/api/messages/${b.id}?before=${ids[4]}&limit=2`, {
      cookie: a.cookie,
    });
    assert.deepEqual(back.json.items.map((m) => m.id), [ids[2], ids[3]]);
  });

  it('refuse un curseur invalide', async () => {
    const { a, b } = await friends();
    const c = await account();
    await befriend(a, c);
    const mine = (await send(a, b, 'un')).json;
    const foreign = (await send(a, c, 'deux')).json;
    const get = (qs) => call('GET', `/api/messages/${b.id}?${qs}`, { cookie: a.cookie });

    assert.equal((await get(`after=${foreign.id}`)).res.status, 400);
    assert.equal((await get(`before=${foreign.id}`)).res.status, 400);
    assert.equal((await get('after=00000000-0000-4000-8000-000000000000')).res.status, 400);
    assert.equal((await get('after=pas-un-uuid')).res.status, 400);
    assert.equal((await get(`after=${mine.id}&before=${mine.id}`)).res.status, 400);
  });

  it('survit à la suppression d un compte', async () => {
    const { a, b } = await friends();
    await send(a, b, 'salut');
    await send(b, a, 'oui');
    const del = await call('DELETE', `/api/users/${b.id}`, { cookie: b.cookie });
    assert.equal(del.res.status, 204);

    const list = await call('GET', '/api/messages', { cookie: a.cookie });
    assert.equal(list.res.status, 200);
    assert.deepEqual(list.json.items, []);
    const fr = await call('GET', '/api/friends', { cookie: a.cookie });
    assert.equal(fr.res.status, 200);
    assert.deepEqual(fr.json.items, []);
    assert.equal((await send(a, b, 'x')).res.status, 404);
  });

  it('limite les envois à 30 par minute', async () => {
    const a = await account(limitedBase);
    const b = await account(limitedBase);
    await befriend(a, b, limitedBase);
    for (let i = 0; i < 30; i += 1) {
      const r = await call('POST', `/api/messages/${b.id}`, {
        url: limitedBase,
        cookie: a.cookie,
        body: { body: `m${i}` },
      });
      assert.equal(r.res.status, 201);
    }
    const over = await call('POST', `/api/messages/${b.id}`, {
      url: limitedBase,
      cookie: a.cookie,
      body: { body: 'trop' },
    });
    assert.equal(over.res.status, 429);
  });
});
