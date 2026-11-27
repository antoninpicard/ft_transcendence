import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const created = [];
let server;
let closePool;
let query;
let uniqueUser, cleanupUsers;
let createApp;
let createApiKey;
let base;

before(async () => {
  ({ closePool, query } = await import('../../src/db/pool.js'));
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

const buy = (who, ticket) => call('POST', '/api/game/tickets', { cookie: who.cookie, body: { ticket } });
const reveal = (who, id, keys) =>
  call('POST', `/api/game/tickets/${id}/reveal`, { cookie: who.cookie, body: { keys } });

// Moves the purchase back in time, instead of waiting for the minimal scratching time
const age = (id, interval) =>
  query(`UPDATE ticket_plays SET created_at = now() - $2::interval WHERE id = $1`, [id, interval]);

async function scratched(who, ticket) {
  const { json } = await buy(who, ticket);
  await age(json.id, '1 minute');
  return json;
}

const board = async (who) => (await call('GET', '/api/game/leaderboard', { cookie: who.cookie })).json;

describe('jeu : catalogue', () => {
  it('sert les tickets et les touches du jeu', async () => {
    const a = await account();
    const { res, json } = await call('GET', '/api/game/catalog', { cookie: a.cookie });
    assert.equal(res.status, 200);
    assert.deepEqual(
      json.items.map((t) => [t.id, t.points, t.keys]),
      [
        ['etoile-filante', 10, 4],
        ['diamant-rouge', 25, 7],
        ['royale', 50, 10],
      ],
    );
    assert.deepEqual(json.keys, ['A', 'S', 'D', 'F', 'J', 'K', 'L']);
  });
});

describe('jeu : acheter et ouvrir un ticket', () => {
  it('le serveur tire la séquence et garde le gain secret', async () => {
    const a = await account();
    const { res, json } = await buy(a, 'royale');
    assert.equal(res.status, 201);
    assert.equal(json.ticket, 'royale');
    assert.match(json.sequence, /^[ASDFJKL]{10}$/);
    assert.equal(json.points, undefined);
    // Bought but not revealed: nothing counted yet
    assert.deepEqual((await board(a)).me, { rank: null, score: 0 });
  });

  it('ouvrir un ticket avec la bonne séquence paie ses points et renvoie le classement', async () => {
    const a = await account();
    const t = await scratched(a, 'royale');
    const { res, json } = await reveal(a, t.id, t.sequence.toLowerCase());
    assert.equal(res.status, 200);
    assert.equal(json.ticket, 'royale');
    assert.equal(json.points, 50);
    assert.equal(json.leaderboard.me.score, 50);
    assert.ok(json.leaderboard.me.rank >= 1);

    const t2 = await scratched(a, 'etoile-filante');
    assert.equal((await reveal(a, t2.id, t2.sequence)).json.leaderboard.me.score, 60);
  });

  it('refuse une mauvaise séquence, sans payer', async () => {
    const a = await account();
    const t = await scratched(a, 'etoile-filante');
    const wrong = t.sequence[0] === 'A' ? 'SSSS' : 'AAAA';
    const { res, json } = await reveal(a, t.id, wrong);
    assert.equal(res.status, 400);
    assert.equal(json.error.message, 'Séquence incorrecte');
    assert.equal((await board(a)).me.score, 0);
    // The ticket is still in progress: the right sequence opens it
    assert.equal((await reveal(a, t.id, t.sequence)).res.status, 200);
  });

  it('refuse un grattage plus rapide qu’un humain', async () => {
    const a = await account();
    const { json: t } = await buy(a, 'royale');
    const { res, json } = await reveal(a, t.id, t.sequence);
    assert.equal(res.status, 400);
    assert.equal(json.error.message, 'Grattage trop rapide');
    assert.equal((await board(a)).me.score, 0);
  });

  it('ne paie un ticket qu’une fois, même avec deux ouvertures simultanées', async () => {
    const a = await account();
    const t = await scratched(a, 'diamant-rouge');
    const results = await Promise.all([reveal(a, t.id, t.sequence), reveal(a, t.id, t.sequence)]);
    assert.deepEqual(results.map((r) => r.res.status).sort(), [200, 409]);
    assert.equal((await board(a)).me.score, 25);
    assert.equal((await reveal(a, t.id, t.sequence)).res.status, 409);
  });

  it('un nouveau ticket remplace celui en cours', async () => {
    const a = await account();
    const first = await scratched(a, 'royale');
    const second = await scratched(a, 'etoile-filante');
    assert.notEqual(first.id, second.id);
    assert.equal((await reveal(a, first.id, first.sequence)).res.status, 404);
    assert.equal((await reveal(a, second.id, second.sequence)).json.points, 10);
  });

  it('un ticket expiré est perdu', async () => {
    const a = await account();
    const { json: t } = await buy(a, 'royale');
    await age(t.id, '11 minutes');
    assert.equal((await reveal(a, t.id, t.sequence)).res.status, 404);
  });

  it("le ticket d'un autre joueur est introuvable", async () => {
    const a = await account();
    const b = await account();
    const t = await scratched(a, 'royale');
    assert.equal((await reveal(b, t.id, t.sequence)).res.status, 404);
    assert.equal((await reveal(a, t.id, t.sequence)).res.status, 200);
  });

  it('refuse un ticket inconnu et des points envoyés par le client', async () => {
    const a = await account();
    assert.equal((await buy(a, 'jackpot')).res.status, 400);
    const { json } = await call('POST', '/api/game/tickets', {
      cookie: a.cookie,
      body: { ticket: 'etoile-filante', points: 999999 },
    });
    await age(json.id, '1 minute');
    assert.equal((await reveal(a, json.id, json.sequence)).json.points, 10);
  });

  it('valide les paramètres', async () => {
    const a = await account();
    assert.equal((await reveal(a, 'pas-un-uuid', 'ASDF')).res.status, 400);
    const t = await scratched(a, 'etoile-filante');
    assert.equal((await reveal(a, t.id, 'XYZ')).res.status, 400);
  });
});

describe('jeu : classement', () => {
  it('classe les joueurs par score et donne le même rang aux égalités', async () => {
    // Scores far above any other test's, so these three are the top of the board
    const [a, b, c] = [await account(), await account(), await account()];
    await query(
      `INSERT INTO ticket_plays (user_id, ticket, points, revealed_at)
       VALUES ($1, 'royale', 1000000, now()), ($2, 'royale', 1000000, now()), ($3, 'royale', 2000000, now())`,
      [a.id, b.id, c.id],
    );
    const json = await board(a);
    assert.deepEqual(
      json.top.slice(0, 3).map((e) => [e.user.id, e.rank, e.score]).sort(),
      [
        [a.id, 2, 1000000],
        [b.id, 2, 1000000],
        [c.id, 1, 2000000],
      ].sort(),
    );
    assert.equal(json.top[0].user.username, c.username);
    assert.deepEqual(json.me, { rank: 2, score: 1000000 });
    assert.ok(json.top.length <= 5);
    await query('DELETE FROM ticket_plays WHERE user_id = ANY($1)', [[a.id, b.id, c.id]]);
  });
});

describe('jeu : accès', () => {
  it('exige une connexion, et une session pour jouer', async () => {
    assert.equal((await call('GET', '/api/game/catalog')).res.status, 401);
    assert.equal((await call('GET', '/api/game/leaderboard')).res.status, 401);
    assert.equal((await call('POST', '/api/game/tickets', { body: { ticket: 'royale' } })).res.status, 401);

    const a = await account();
    const t = await scratched(a, 'royale');
    const { key } = await createApiKey(a.id, 'game test');
    assert.equal((await call('GET', '/api/game/catalog', { bearer: key })).res.status, 200);
    assert.equal((await call('GET', '/api/game/leaderboard', { bearer: key })).res.status, 200);
    const opts = { bearer: key, body: { ticket: 'royale' } };
    assert.equal((await call('POST', '/api/game/tickets', opts)).res.status, 403);
    const revealOpts = { bearer: key, body: { keys: t.sequence } };
    assert.equal((await call('POST', `/api/game/tickets/${t.id}/reveal`, revealOpts)).res.status, 403);
  });

  it('405 sur une mauvaise méthode', async () => {
    const a = await account();
    const t = await scratched(a, 'royale');
    assert.equal((await call('POST', '/api/game/catalog', { cookie: a.cookie })).res.status, 405);
    assert.equal((await call('POST', '/api/game/leaderboard', { cookie: a.cookie })).res.status, 405);
    assert.equal((await call('GET', '/api/game/tickets', { cookie: a.cookie })).res.status, 405);
    assert.equal((await call('GET', `/api/game/tickets/${t.id}/reveal`, { cookie: a.cookie })).res.status, 405);
  });

  it('la suppression du compte supprime ses tickets', async () => {
    const a = await account();
    const t = await scratched(a, 'royale');
    await reveal(a, t.id, t.sequence);
    await buy(a, 'royale');
    await call('DELETE', `/api/users/${a.id}`, { cookie: a.cookie });
    const { rows } = await query('SELECT 1 FROM ticket_plays WHERE user_id = $1', [a.id]);
    assert.equal(rows.length, 0);
  });
});
