import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const envModule = fileURLToPath(new URL('../../src/config/env.js', import.meta.url));

const SECRET = 'a'.repeat(32);

function load(vars) {
  const script = `const { env } = await import(${JSON.stringify(envModule)});
process.stdout.write(JSON.stringify({
  fortyTwoConfigured: env.fortyTwoConfigured,
  badgeConfigured: env.badgeConfigured,
  badgeLoginAllowedIps: [...env.badgeLoginAllowedIps],
}));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://unused@127.0.0.1:5432/unused',
      ...vars,
    },
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stderr: result.stderr,
    config: result.status === 0 ? JSON.parse(result.stdout) : null,
  };
}

describe('configuration', () => {
  it('démarre sans les variables optionnelles', () => {
    const { status, config } = load({});
    assert.equal(status, 0);
    assert.deepEqual(config, {
      fortyTwoConfigured: false,
      badgeConfigured: false,
      badgeLoginAllowedIps: [],
    });
  });

  it('traite une valeur vide comme absente', () => {
    const { status, config } = load({
      FORTYTWO_CLIENT_ID: '',
      FORTYTWO_CLIENT_SECRET: '',
      FORTYTWO_REDIRECT_URI: '',
      DEVICE_TOKEN: '',
      BADGE_UID_SECRET: '',
      BADGE_LOGIN_ALLOWED_IPS: '',
    });
    assert.equal(status, 0);
    assert.deepEqual(config, {
      fortyTwoConfigured: false,
      badgeConfigured: false,
      badgeLoginAllowedIps: [],
    });
  });

  it('active la badgeuse avec un secret de 32 caractères et un jeton court', () => {
    const { status, config } = load({ DEVICE_TOKEN: 'abc', BADGE_UID_SECRET: SECRET });
    assert.equal(status, 0);
    assert.equal(config.badgeConfigured, true);
  });

  it('refuse un secret de hachage trop court', () => {
    const { status, stderr } = load({ DEVICE_TOKEN: 'abc', BADGE_UID_SECRET: 'a'.repeat(31) });
    assert.equal(status, 1);
    assert.match(stderr, /BADGE_UID_SECRET/);
  });

  for (const key of [
    'FORTYTWO_CLIENT_ID',
    'FORTYTWO_CLIENT_SECRET',
    'FORTYTWO_REDIRECT_URI',
    'DEVICE_TOKEN',
    'BADGE_UID_SECRET',
    'BADGE_LOGIN_ALLOWED_IPS',
  ]) {
    it(`refuse une valeur d'exemple dans ${key}`, () => {
      const placeholder = `<valeur_a_remplacer_${'x'.repeat(32)}>`;
      const { status, stderr } = load({ [key]: placeholder });
      assert.equal(status, 1);
      assert.match(stderr, new RegExp(key));
      assert.match(stderr, /valeur d'exemple non remplacée/);
    });
  }

  it("refuse une valeur d'exemple au milieu d'une URL", () => {
    const { status, stderr } = load({
      FORTYTWO_REDIRECT_URI: 'http://<hote>:3000/api/auth/42/callback',
    });
    assert.equal(status, 1);
    assert.match(stderr, /FORTYTWO_REDIRECT_URI/);
  });

  it('normalise la liste des adresses de la borne', () => {
    const { status, config } = load({
      BADGE_LOGIN_ALLOWED_IPS: ' 10.0.0.7 ,::ffff:192.168.1.20,, 2001:DB8:0:0:0:0:0:7 ',
    });
    assert.equal(status, 0);
    assert.deepEqual(config.badgeLoginAllowedIps, ['10.0.0.7', '192.168.1.20', '2001:db8::7']);
  });

  it('refuse une liste qui contient autre chose qu une adresse IP', () => {
    for (const value of ['10.0.0.7, borne.local', '10.0.0.0/24']) {
      const { status, stderr } = load({ BADGE_LOGIN_ALLOWED_IPS: value });
      assert.equal(status, 1, value);
      assert.match(stderr, /BADGE_LOGIN_ALLOWED_IPS/);
    }
  });
});
