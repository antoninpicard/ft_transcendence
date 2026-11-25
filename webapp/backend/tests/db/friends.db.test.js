import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const created = [];
let server;
let closePool;
let uniqueUser, cleanupUsers;
let createApp;
let createApiKey;
let pool;
let sendFriendRequest;
let base;

before(async () => {
  ({ closePool, pool } = await import('../../src/db/pool.js'));
  ({ sendFriendRequest } = await import('../../src/services/friends.service.js'));
  ({ uniqueUser, cleanupUsers } = await import('./helpers.js'));
  ({ createApiKey } = await import('../../src/services/apiKeys.service.js'));
  ({ createApp } = await import('../../src/app.js'));
  server = createApp({ rateLimit: false }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  await cleanupUsers(created);
  await closePool();
});

async function call(method, path, { bearer, cookie, body } = {}) {
  const headers = {};
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { res, json: text ? JSON.parse(text) : null };
}

async function account() {
  const user = uniqueUser();
  created.push(user.username);
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(user),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  const cookie = res.headers.getSetCookie()[0].split(';')[0];
  return { id: body.id, username: user.username, cookie };
}

function ask(from, to) {
  return call('POST', '/api/friends/requests', { cookie: from.cookie, body: { userId: to.id } });
}

function befriend(a, b) {
  return ask(a, b).then(() => call('POST', `/api/friends/requests/${a.id}/accept`, { cookie: b.cookie }));
}

describe('routes des amis', () => {
  it('envoie puis accepte une demande', async () => {
    const a = await account();
    const b = await account();

    const sent = await ask(a, b);
    assert.equal(sent.res.status, 201);
    assert.equal(sent.json.status, 'pending');
    assert.equal(sent.json.user.id, b.id);
    assert.equal(sent.json.user.username, b.username);

    const received = await call('GET', '/api/friends/requests', { cookie: b.cookie });
    assert.equal(received.json.incoming.length, 1);
    assert.equal(received.json.incoming[0].user.id, a.id);
    assert.ok(received.json.incoming[0].createdAt);
    assert.deepEqual(received.json.outgoing, []);

    const outgoing = await call('GET', '/api/friends/requests', { cookie: a.cookie });
    assert.equal(outgoing.json.outgoing.length, 1);
    assert.equal(outgoing.json.outgoing[0].user.id, b.id);
    assert.deepEqual(outgoing.json.incoming, []);

    const accepted = await call('POST', `/api/friends/requests/${a.id}/accept`, {
      cookie: b.cookie,
    });
    assert.equal(accepted.res.status, 200);
    assert.equal(accepted.json.status, 'accepted');
    assert.equal(accepted.json.user.id, a.id);

    const friendsOfA = await call('GET', '/api/friends', { cookie: a.cookie });
    assert.equal(friendsOfA.json.items.length, 1);
    assert.equal(friendsOfA.json.items[0].user.id, b.id);
    assert.ok(friendsOfA.json.items[0].since);
    const friendsOfB = await call('GET', '/api/friends', { cookie: b.cookie });
    assert.equal(friendsOfB.json.items[0].user.id, a.id);
    assert.ok(friendsOfB.json.items[0].since);
  });

  it("accepte d'office une demande croisée", async () => {
    const a = await account();
    const b = await account();
    assert.equal((await ask(b, a)).res.status, 201);
    const crossed = await ask(a, b);
    assert.equal(crossed.res.status, 200);
    assert.equal(crossed.json.status, 'accepted');
    assert.equal(crossed.json.user.id, b.id);
    const friends = await call('GET', '/api/friends', { cookie: a.cookie });
    assert.equal(friends.json.items.length, 1);
  });

  it('rend amis deux demandes croisées simultanées', async () => {
    for (let i = 0; i < 5; i += 1) {
      const a = await account();
      const b = await account();
      const [first, second] = await Promise.all([ask(a, b), ask(b, a)]);
      assert.ok([200, 201].includes(first.res.status), `statut ${first.res.status}`);
      assert.ok([200, 201].includes(second.res.status), `statut ${second.res.status}`);
      const friends = await call('GET', '/api/friends', { cookie: a.cookie });
      assert.equal(friends.json.items.length, 1);
      assert.equal(friends.json.items[0].user.id, b.id);
    }
  });

  it('refuse une demande à soi-même, à un inconnu, en double', async () => {
    const a = await account();
    const b = await account();

    assert.equal((await ask(a, a)).res.status, 400);
    const unknown = await call('POST', '/api/friends/requests', {
      cookie: a.cookie,
      body: { userId: '00000000-0000-4000-8000-000000000000' },
    });
    assert.equal(unknown.res.status, 404);
    const invalid = await call('POST', '/api/friends/requests', {
      cookie: a.cookie,
      body: { userId: 'pas-un-uuid' },
    });
    assert.equal(invalid.res.status, 400);

    assert.equal((await ask(a, b)).res.status, 201);
    assert.equal((await ask(a, b)).res.status, 409);

    await call('POST', `/api/friends/requests/${a.id}/accept`, { cookie: b.cookie });
    assert.equal((await ask(a, b)).res.status, 409);
    assert.equal((await ask(b, a)).res.status, 409);
  });

  it('refuse ou annule une demande', async () => {
    const a = await account();
    const b = await account();
    const c = await account();

    await ask(a, b);
    const refused = await call('DELETE', `/api/friends/requests/${a.id}`, { cookie: b.cookie });
    assert.equal(refused.res.status, 204);

    await ask(a, c);
    const cancelled = await call('DELETE', `/api/friends/requests/${c.id}`, { cookie: a.cookie });
    assert.equal(cancelled.res.status, 204);

    const requests = await call('GET', '/api/friends/requests', { cookie: a.cookie });
    assert.deepEqual(requests.json, { incoming: [], outgoing: [] });

    const again = await call('DELETE', `/api/friends/requests/${c.id}`, { cookie: a.cookie });
    assert.equal(again.res.status, 404);
    assert.equal((await ask(a, b)).res.status, 201);
  });

  it("n'accepte que les demandes reçues", async () => {
    const a = await account();
    const b = await account();
    const c = await account();
    await ask(a, b);

    const own = await call('POST', `/api/friends/requests/${b.id}/accept`, { cookie: a.cookie });
    assert.equal(own.res.status, 404);
    const foreign = await call('POST', `/api/friends/requests/${a.id}/accept`, {
      cookie: c.cookie,
    });
    assert.equal(foreign.res.status, 404);

    await call('POST', `/api/friends/requests/${a.id}/accept`, { cookie: b.cookie });
    const already = await call('POST', `/api/friends/requests/${a.id}/accept`, {
      cookie: b.cookie,
    });
    assert.equal(already.res.status, 404);
    const cancelFriend = await call('DELETE', `/api/friends/requests/${a.id}`, {
      cookie: b.cookie,
    });
    assert.equal(cancelFriend.res.status, 404);
  });

  it('retire un ami', async () => {
    const a = await account();
    const b = await account();
    const c = await account();
    await befriend(a, b);
    await ask(a, c);

    const pendingOnly = await call('DELETE', `/api/friends/${c.id}`, { cookie: a.cookie });
    assert.equal(pendingOnly.res.status, 404);
    const stranger = await call('DELETE', `/api/friends/${a.id}`, { cookie: c.cookie });
    assert.equal(stranger.res.status, 404);

    const removed = await call('DELETE', `/api/friends/${b.id}`, { cookie: a.cookie });
    assert.equal(removed.res.status, 204);
    const list = await call('GET', '/api/friends', { cookie: b.cookie });
    assert.deepEqual(list.json.items, []);
    const again = await call('DELETE', `/api/friends/${b.id}`, { cookie: a.cookie });
    assert.equal(again.res.status, 404);
  });

  it('accepte les UUID en majuscules', async () => {
    const a = await account();
    const b = await account();

    const sent = await call('POST', '/api/friends/requests', {
      cookie: a.cookie,
      body: { userId: b.id.toUpperCase() },
    });
    assert.equal(sent.res.status, 201);
    assert.equal(sent.json.user.id, b.id);

    const accepted = await call('POST', `/api/friends/requests/${a.id.toUpperCase()}/accept`, {
      cookie: b.cookie,
    });
    assert.equal(accepted.res.status, 200);

    const removed = await call('DELETE', `/api/friends/${a.id.toUpperCase()}`, {
      cookie: b.cookie,
    });
    assert.equal(removed.res.status, 204);

    await ask(a, b);
    const cancelled = await call('DELETE', `/api/friends/requests/${b.id.toUpperCase()}`, {
      cookie: a.cookie,
    });
    assert.equal(cancelled.res.status, 204);
  });

  it('affiche la relation sur le profil', async () => {
    const a = await account();
    const b = await account();
    const c = await account();
    const d = await account();
    await ask(a, b);
    await ask(c, a);
    await befriend(a, d);

    const relation = async (target) =>
      (await call('GET', `/api/users/${target.id}`, { cookie: a.cookie })).json.relation;
    assert.equal(await relation(a), 'self');
    assert.equal(await relation(b), 'request-sent');
    assert.equal(await relation(c), 'request-received');
    assert.equal(await relation(d), 'friends');
    const e = await account();
    assert.equal(await relation(e), 'none');

    const anonymous = await call('GET', `/api/users/${b.id}`);
    assert.equal(anonymous.res.status, 200);
    assert.equal(Object.hasOwn(anonymous.json, 'relation'), false);
  });

  it("fonctionne avec une clé d'API", async () => {
    const a = await account();
    const b = await account();
    const apiKey = await createApiKey(a.id, 'test');
    const { res, json } = await call('POST', '/api/friends/requests', {
      bearer: apiKey.key,
      body: { userId: b.id },
    });
    assert.equal(res.status, 201);
    assert.equal(json.status, 'pending');
  });

  it('refuse sans authentification et répond 405', async () => {
    const anonymous = await call('GET', '/api/friends');
    assert.equal(anonymous.res.status, 401);
    const a = await account();
    const wrong = await call('PUT', '/api/friends', { cookie: a.cookie });
    assert.equal(wrong.res.status, 405);
    const wrongRequests = await call('PUT', '/api/friends/requests', { cookie: a.cookie });
    assert.equal(wrongRequests.res.status, 405);
    const deleteRequests = await call('DELETE', '/api/friends/requests', { cookie: a.cookie });
    assert.equal(deleteRequests.res.status, 405);
    assert.equal(deleteRequests.res.headers.get('allow'), 'GET, POST');
  });

  it('répond 404 si la cible disparaît pendant la demande', async () => {
    const [a, b] = [await account(), await account()];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM users WHERE id = $1', [b.id]);
      const pending = sendFriendRequest(a.id, b.id);
      const outcome = pending.then(
        () => null,
        (err) => err,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      await client.query('COMMIT');
      const err = await outcome;
      assert.equal(err?.statusCode, 404);
    } finally {
      client.release();
    }
  });

  it('ne laisse pas un tiers annuler la demande des autres', async () => {
    const [a, b, c] = [await account(), await account(), await account()];
    await ask(a, b);
    const attempt = await call('DELETE', `/api/friends/requests/${a.id}`, { cookie: c.cookie });
    assert.equal(attempt.res.status, 404);
    const requests = await call('GET', '/api/friends/requests', { cookie: b.cookie });
    assert.equal(requests.json.incoming.length, 1);
    assert.equal(requests.json.incoming[0].user.id, a.id);
  });
});
