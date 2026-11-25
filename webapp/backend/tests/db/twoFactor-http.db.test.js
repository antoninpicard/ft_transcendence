import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { closePool, queryOne } from '../../src/db/pool.js';
import { codeAt, currentStep } from '../../src/utils/totp.js';
import { uniqueUser, cleanupUsers } from './helpers.js';

const created = [];
let server;
let base;

before(() => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await cleanupUsers(created);
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await closePool();
});

function request(method, path, { body, cookie, headers } = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function setCookies(res) {
  return res.headers.getSetCookie();
}

function cookieNamed(res, name) {
  const line = setCookies(res).find((c) => c.startsWith(`${name}=`));
  return line ? line.split(';')[0] : null;
}

// A code is accepted once per 30-second step, within one step of drift. Each
// user gets at most two codes per test: the current step, then the next one, so
// a step boundary crossed during the test never makes a code invalid.
function codes(secret) {
  const step = currentStep(Date.now());
  return [codeAt(secret, step), codeAt(secret, step + 1)];
}

async function signUp() {
  const user = uniqueUser();
  created.push(user.username);
  const res = await request('POST', '/api/auth/register', { body: user });
  assert.equal(res.status, 201);
  return { user, id: (await res.json()).id, cookie: cookieNamed(res, 'sid') };
}

// Registers an account and turns 2FA on; returns the code already used by
// enable and the next one, still unused
async function signUpWithTwoFactor() {
  const account = await signUp();
  const setup = await request('POST', '/api/auth/2fa/setup', { cookie: account.cookie });
  assert.equal(setup.status, 200);
  const { secret } = await setup.json();
  const [used, next] = codes(secret);
  const enable = await request('POST', '/api/auth/2fa/enable', {
    cookie: account.cookie,
    body: { code: used },
  });
  assert.equal(enable.status, 204);
  return { ...account, secret, used, next };
}

function login(user) {
  return request('POST', '/api/auth/login', {
    body: { identifier: user.username, password: user.password },
  });
}

async function pendingLogin(user) {
  const res = await login(user);
  assert.equal(res.status, 200);
  return cookieNamed(res, 'twofa_pending');
}

function verify(pending, code) {
  return request('POST', '/api/auth/2fa/verify', { cookie: pending, body: { code } });
}

async function createKey(cookie) {
  const res = await request('POST', '/api/keys', { cookie, body: { name: 'test 2fa' } });
  assert.equal(res.status, 201);
  return (await res.json()).key;
}

describe('activation de la 2FA', () => {
  it('est désactivée sur un nouveau compte', async () => {
    const { cookie } = await signUp();
    const res = await request('GET', '/api/auth/2fa', { cookie });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { enabled: false });
  });

  it('setup renvoie un secret base32 et le lien du QR code', async () => {
    const { user, cookie } = await signUp();
    const res = await request('POST', '/api/auth/2fa/setup', { cookie });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.secret, /^[A-Z2-7]{32}$/);
    assert.ok(body.otpauthUrl.startsWith('otpauth://totp/'));
    assert.ok(body.otpauthUrl.includes(`secret=${body.secret}`));
    assert.ok(body.otpauthUrl.includes(encodeURIComponent(user.username)));
  });

  it('setup ne l’active pas tant que le premier code n’est pas confirmé', async () => {
    const { cookie } = await signUp();
    await request('POST', '/api/auth/2fa/setup', { cookie });
    const res = await request('GET', '/api/auth/2fa', { cookie });
    assert.deepEqual(await res.json(), { enabled: false });
  });

  it('enable sans setup préalable renvoie 400', async () => {
    const { cookie } = await signUp();
    const res = await request('POST', '/api/auth/2fa/enable', { cookie, body: { code: '123456' } });
    assert.equal(res.status, 400);
  });

  it('enable refuse un mauvais code et laisse la 2FA désactivée', async () => {
    const { cookie } = await signUp();
    const setup = await request('POST', '/api/auth/2fa/setup', { cookie });
    const [good] = codes((await setup.json()).secret);
    const wrong = good === '000000' ? '000001' : '000000';
    const res = await request('POST', '/api/auth/2fa/enable', { cookie, body: { code: wrong } });
    assert.equal(res.status, 400);
    const status = await request('GET', '/api/auth/2fa', { cookie });
    assert.deepEqual(await status.json(), { enabled: false });
  });

  it('refuse un code qui ne fait pas 6 chiffres', async () => {
    const { cookie } = await signUp();
    await request('POST', '/api/auth/2fa/setup', { cookie });
    for (const code of ['12345', '1234567', 'abcdef', 123456]) {
      const res = await request('POST', '/api/auth/2fa/enable', { cookie, body: { code } });
      assert.equal(res.status, 400, `code ${JSON.stringify(code)}`);
    }
  });

  it('enable avec le bon code active la 2FA', async () => {
    const { cookie } = await signUpWithTwoFactor();
    const res = await request('GET', '/api/auth/2fa', { cookie });
    assert.deepEqual(await res.json(), { enabled: true });
  });

  it('setup et enable renvoient 409 une fois la 2FA active', async () => {
    const { cookie, next } = await signUpWithTwoFactor();
    const setup = await request('POST', '/api/auth/2fa/setup', { cookie });
    assert.equal(setup.status, 409);
    const enable = await request('POST', '/api/auth/2fa/enable', { cookie, body: { code: next } });
    assert.equal(enable.status, 409);
  });

  it('le secret n’apparaît dans aucune réponse sur l’utilisateur', async () => {
    const { id, cookie } = await signUpWithTwoFactor();
    for (const path of ['/api/auth/me', `/api/users/${id}`]) {
      const text = await (await request('GET', path, { cookie })).text();
      assert.doesNotMatch(text, /totp|secret/i, path);
    }
  });
});

describe('routes de gestion de la 2FA', () => {
  it('renvoient 401 sans connexion', async () => {
    const calls = [
      ['GET', '/api/auth/2fa'],
      ['POST', '/api/auth/2fa/setup'],
      ['POST', '/api/auth/2fa/enable', { code: '123456' }],
      ['POST', '/api/auth/2fa/disable', { code: '123456' }],
    ];
    for (const [method, path, body] of calls) {
      const res = await request(method, path, { body });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
  });

  it('renvoient 403 avec une clé d’API', async () => {
    const { cookie } = await signUp();
    const key = await createKey(cookie);
    const headers = { authorization: `Bearer ${key}` };
    const calls = [
      ['GET', '/api/auth/2fa'],
      ['POST', '/api/auth/2fa/setup'],
      ['POST', '/api/auth/2fa/enable', { code: '123456' }],
      ['POST', '/api/auth/2fa/disable', { code: '123456' }],
    ];
    for (const [method, path, body] of calls) {
      const res = await request(method, path, { body, headers });
      assert.equal(res.status, 403, `${method} ${path}`);
    }
  });

  it('répondent 405 avec la mauvaise méthode', async () => {
    const calls = [
      ['POST', '/api/auth/2fa', 'GET'],
      ['GET', '/api/auth/2fa/setup', 'POST'],
      ['GET', '/api/auth/2fa/enable', 'POST'],
      ['GET', '/api/auth/2fa/disable', 'POST'],
      ['GET', '/api/auth/2fa/verify', 'POST'],
      ['POST', '/api/auth/session', 'GET'],
    ];
    for (const [method, path, allow] of calls) {
      const res = await request(method, path);
      assert.equal(res.status, 405, `${method} ${path}`);
      assert.equal(res.headers.get('allow'), allow);
    }
  });
});

describe('connexion avec la 2FA', () => {
  it('le mot de passe seul n’ouvre pas de session', async () => {
    const { user } = await signUpWithTwoFactor();
    const res = await login(user);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { twoFactorRequired: true });
    assert.equal(cookieNamed(res, 'sid'), null);
    const pending = setCookies(res).find((c) => c.startsWith('twofa_pending='));
    assert.ok(pending);
    assert.match(pending, /HttpOnly/i);
    assert.match(pending, /Path=\/api\/auth\/2fa/);
    assert.match(pending, /SameSite=Lax/i);
    assert.match(pending, /Max-Age=300/);
  });

  it('le jeton en attente ne donne accès à rien', async () => {
    const { user } = await signUpWithTwoFactor();
    const pending = await pendingLogin(user);
    const res = await request('GET', '/api/auth/me', { cookie: pending });
    assert.equal(res.status, 401);
  });

  it('verify avec le bon code ouvre la session', async () => {
    const { user, next } = await signUpWithTwoFactor();
    const pending = await pendingLogin(user);
    const res = await verify(pending, next);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.username, user.username);
    assert.equal(body.email, user.email);
    const sid = cookieNamed(res, 'sid');
    assert.ok(sid);
    const cleared = setCookies(res).find((c) => c.startsWith('twofa_pending='));
    assert.match(cleared, /Expires=Thu, 01 Jan 1970/);
    const me = await request('GET', '/api/auth/me', { cookie: sid });
    assert.equal(me.status, 200);
  });

  it('le jeton en attente ne sert qu’une fois', async () => {
    const { user, next } = await signUpWithTwoFactor();
    const pending = await pendingLogin(user);
    assert.equal((await verify(pending, next)).status, 200);
    const again = await verify(pending, next);
    assert.equal(again.status, 401);
  });

  it('refuse le code déjà utilisé pour activer la 2FA', async () => {
    const { user, used } = await signUpWithTwoFactor();
    const pending = await pendingLogin(user);
    const res = await verify(pending, used);
    assert.equal(res.status, 401);
  });

  it('un même code ne passe qu’une fois, même sur deux connexions en parallèle', async () => {
    const { user, next } = await signUpWithTwoFactor();
    const [first, second] = [await pendingLogin(user), await pendingLogin(user)];
    const statuses = (await Promise.all([verify(first, next), verify(second, next)])).map(
      (res) => res.status,
    );
    assert.deepEqual(statuses.sort(), [200, 401]);
  });

  it('refuse verify sans jeton en attente', async () => {
    const { next } = await signUpWithTwoFactor();
    const res = await verify(undefined, next);
    assert.equal(res.status, 401);
  });

  it('refuse un mauvais code', async () => {
    const { user, next } = await signUpWithTwoFactor();
    const pending = await pendingLogin(user);
    const wrong = next === '000000' ? '000001' : '000000';
    const res = await verify(pending, wrong);
    assert.equal(res.status, 401);
  });

  it('après 5 mauvais codes, il faut recommencer la connexion', async () => {
    const { user, next } = await signUpWithTwoFactor();
    const pending = await pendingLogin(user);
    const wrong = next === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) {
      assert.equal((await verify(pending, wrong)).status, 401);
    }
    assert.equal((await verify(pending, next)).status, 401);

    const fresh = await pendingLogin(user);
    assert.equal((await verify(fresh, next)).status, 200);
  });

  it('valide le format du code avant de chercher la connexion en attente', async () => {
    const res = await verify(undefined, '12');
    assert.equal(res.status, 400);
  });

  it('un mauvais mot de passe reste un 401 sans jeton en attente', async () => {
    const { user } = await signUpWithTwoFactor();
    const res = await request('POST', '/api/auth/login', {
      body: { identifier: user.username, password: 'mauvais-mot-de-passe' },
    });
    assert.equal(res.status, 401);
    assert.equal(cookieNamed(res, 'twofa_pending'), null);
  });
});

describe('désactivation de la 2FA', () => {
  it('exige un code valide', async () => {
    const { cookie, next } = await signUpWithTwoFactor();
    const wrong = next === '000000' ? '000001' : '000000';
    const res = await request('POST', '/api/auth/2fa/disable', { cookie, body: { code: wrong } });
    assert.equal(res.status, 400);
    const status = await request('GET', '/api/auth/2fa', { cookie });
    assert.deepEqual(await status.json(), { enabled: true });
  });

  it('avec le bon code, désactive la 2FA et efface le secret', async () => {
    const { id, user, cookie, next } = await signUpWithTwoFactor();
    const res = await request('POST', '/api/auth/2fa/disable', { cookie, body: { code: next } });
    assert.equal(res.status, 204);
    const status = await request('GET', '/api/auth/2fa', { cookie });
    assert.deepEqual(await status.json(), { enabled: false });
    const row = await queryOne(
      'SELECT totp_secret, totp_enabled, totp_last_step FROM users WHERE id = $1',
      [id],
    );
    assert.deepEqual(row, { totp_secret: null, totp_enabled: false, totp_last_step: null });

    const relog = await login(user);
    assert.ok(cookieNamed(relog, 'sid'));
    assert.notDeepEqual(await relog.json(), { twoFactorRequired: true });
  });

  it('renvoie 400 quand la 2FA n’est pas active', async () => {
    const { cookie } = await signUp();
    const res = await request('POST', '/api/auth/2fa/disable', { cookie, body: { code: '123456' } });
    assert.equal(res.status, 400);
  });
});

describe('GET /auth/session', () => {
  it('renvoie null sans connexion', async () => {
    const res = await request('GET', '/api/auth/session');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { user: null });
  });

  it('renvoie l’utilisateur privé avec une session', async () => {
    const { user, cookie } = await signUp();
    const res = await request('GET', '/api/auth/session', { cookie });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.username, user.username);
    assert.equal(body.user.email, user.email);
  });

  it('renvoie null avec une clé d’API', async () => {
    const { cookie } = await signUp();
    const key = await createKey(cookie);
    const res = await request('GET', '/api/auth/session', {
      headers: { authorization: `Bearer ${key}` },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { user: null });
  });

  it('renvoie null pendant une connexion en attente du code', async () => {
    const { user } = await signUpWithTwoFactor();
    const pending = await pendingLogin(user);
    const res = await request('GET', '/api/auth/session', { cookie: pending });
    assert.deepEqual(await res.json(), { user: null });
  });
});
