import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

let profile;
const created = [];
let closePool;
let query;
let uniqueUser, cleanupUsers;
let intra;
let server;
let base;
let intraBase;

before(async () => {
  intra = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/oauth/token') {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        const code = new URLSearchParams(raw).get('code') ?? JSON.parse(raw || '{}').code;
        if (code === 'fail') {
          res.writeHead(500).end();
          return;
        }
        const reply = () => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ access_token: 'jeton-de-test', token_type: 'bearer' }));
        };
        if (code === 'slow') setTimeout(reply, 6000);
        else reply();
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/v2/me') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(profile));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => intra.listen(0, '127.0.0.1', resolve));
  intraBase = `http://127.0.0.1:${intra.address().port}`;

  process.env.FORTYTWO_CLIENT_ID = 'client-id-test';
  process.env.FORTYTWO_CLIENT_SECRET = 'client-secret-test';
  process.env.FORTYTWO_REDIRECT_URI = 'http://localhost:3000/api/auth/42/callback';
  process.env.FORTYTWO_API_URL = intraBase;
  delete process.env.FRONT_URL;

  ({ closePool, query } = await import('../../src/db/pool.js'));
  ({ uniqueUser, cleanupUsers } = await import('./helpers.js'));
  const { createApp } = await import('../../src/app.js');
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await cleanupUsers(created);
  intra.closeAllConnections();
  await new Promise((resolve) => intra.close(resolve));
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await closePool();
});

beforeEach(() => {
  const suffix = randomBytes(5).toString('hex');
  profile = {
    id: Math.floor(Math.random() * 1_000_000_000) + 1_000_000,
    email: `fortytwo-${suffix}@example.test`,
    login: `ft${suffix}`,
  };
  created.push(profile.login);
});

const get = (path, cookie) =>
  fetch(`${base}${path}`, { redirect: 'manual', headers: cookie ? { cookie } : {} });

function setCookies(res) {
  return res.headers.getSetCookie();
}

function cookieNamed(res, name) {
  return setCookies(res).find((c) => c.startsWith(`${name}=`));
}

async function start() {
  const res = await get('/api/auth/42');
  const state = new URL(res.headers.get('location')).searchParams.get('state');
  return { res, state, cookie: `oauth_state=${state}` };
}

describe('démarrage de la connexion 42', () => {
  it('redirige vers l intra avec un state et pose le cookie', async () => {
    const { res, state } = await start();
    assert.equal(res.status, 302);
    const location = res.headers.get('location');
    assert.ok(location.startsWith(`${intraBase}/oauth/authorize`));
    assert.match(state, /^[0-9a-f]{32}$/);
    const cookie = cookieNamed(res, 'oauth_state');
    assert.ok(cookie.includes(`oauth_state=${state}`));
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Path=\/api\/auth\/42/);
  });
});

describe('callback 42', () => {
  it('connecte et redirige vers /home', async () => {
    const { state, cookie } = await start();
    const res = await get(`/api/auth/42/callback?code=ok&state=${state}`, cookie);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/home');
    const sid = cookieNamed(res, 'sid');
    assert.ok(sid);
    const me = await get('/api/auth/me', sid.split(';')[0]);
    assert.equal(me.status, 200);
    assert.equal((await me.json()).email, profile.email);
  });

  it('refuse un state faux', async () => {
    const { cookie } = await start();
    const res = await get('/api/auth/42/callback?code=ok&state=faux', cookie);
    assert.equal(res.headers.get('location'), '/login?oauth_error=oauth_state');
    assert.equal(cookieNamed(res, 'sid'), undefined);
  });

  it('refuse un state absent du cookie', async () => {
    const { state } = await start();
    const res = await get(`/api/auth/42/callback?code=ok&state=${state}`);
    assert.equal(res.headers.get('location'), '/login?oauth_error=oauth_state');
    assert.equal(cookieNamed(res, 'sid'), undefined);
  });

  it('refuse un callback rejoué', async () => {
    const { state, cookie } = await start();
    const first = await get(`/api/auth/42/callback?code=ok&state=${state}`, cookie);
    assert.equal(first.headers.get('location'), '/home');
    const cleared = cookieNamed(first, 'oauth_state');
    assert.match(cleared, /oauth_state=;/);
    const replay = await get(`/api/auth/42/callback?code=ok&state=${state}`);
    assert.equal(replay.headers.get('location'), '/login?oauth_error=oauth_state');
  });

  it('traite le refus de l utilisateur', async () => {
    const { state, cookie } = await start();
    const res = await get(`/api/auth/42/callback?error=access_denied&state=${state}`, cookie);
    assert.equal(res.headers.get('location'), '/login?oauth_error=oauth_denied');
  });

  it('refuse un email déjà pris', async () => {
    const local = uniqueUser();
    created.push(local.username);
    const reg = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(local),
    });
    assert.equal(reg.status, 201);
    profile.email = local.email;
    const { state, cookie } = await start();
    const res = await get(`/api/auth/42/callback?code=ok&state=${state}`, cookie);
    assert.equal(res.headers.get('location'), '/login?oauth_error=oauth_email_taken');
    assert.equal(cookieNamed(res, 'sid'), undefined);
  });

  it('traite un intra en erreur', async () => {
    const { state, cookie } = await start();
    const res = await get(`/api/auth/42/callback?code=fail&state=${state}`, cookie);
    assert.equal(res.headers.get('location'), '/login?oauth_error=oauth_unavailable');
  });

  it('traite un intra trop lent', async () => {
    const { state, cookie } = await start();
    const began = Date.now();
    const res = await get(`/api/auth/42/callback?code=slow&state=${state}`, cookie);
    assert.equal(res.headers.get('location'), '/login?oauth_error=oauth_unavailable');
    assert.ok(Date.now() - began < 6000);
  });

  it('traite un profil sans email', async () => {
    profile.email = null;
    const { state, cookie } = await start();
    const res = await get(`/api/auth/42/callback?code=ok&state=${state}`, cookie);
    assert.equal(res.headers.get('location'), '/login?oauth_error=oauth_unavailable');
  });

  it('efface le cookie state dans tous les cas', async () => {
    const { state, cookie } = await start();
    const urls = [
      `/api/auth/42/callback?code=ok&state=${state}`,
      '/api/auth/42/callback?code=ok&state=faux',
      `/api/auth/42/callback?error=access_denied&state=${state}`,
      `/api/auth/42/callback?code=fail&state=${state}`,
    ];
    for (const url of urls) {
      const res = await get(url, cookie);
      const cleared = cookieNamed(res, 'oauth_state');
      assert.ok(cleared, url);
      assert.match(cleared, /oauth_state=;/);
      assert.match(cleared, /Expires=/i);
    }
  });

  it('traite un échec de création de session', async () => {
    const suffix = randomBytes(4).toString('hex');
    const fn = `test_refuse_session_${suffix}`;
    const trigger = `test_refuse_session_trg_${suffix}`;
    await query(`
      CREATE FUNCTION ${fn}() RETURNS trigger AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND username = '${profile.login}') THEN
          RAISE EXCEPTION 'session refusée pour le test';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`);
    await query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON sessions FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
    try {
      const { state, cookie } = await start();
      const res = await get(`/api/auth/42/callback?code=ok&state=${state}`, cookie);
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/login?oauth_error=oauth_unavailable');
      assert.equal(cookieNamed(res, 'sid'), undefined);
    } finally {
      await query(`DROP TRIGGER IF EXISTS ${trigger} ON sessions`);
      await query(`DROP FUNCTION IF EXISTS ${fn}()`);
    }
  });
});
