import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSecureCookieEnv } from '../../src/config/cookies.js';

describe('drapeau secure du cookie de session', () => {
  it('traite un NODE_ENV non défini comme de la production', () => {
    assert.equal(isSecureCookieEnv(undefined), true);
  });

  it('reste sécurisé pour un NODE_ENV inattendu', () => {
    assert.equal(isSecureCookieEnv('staging'), true);
  });

  it('est sécurisé en production', () => {
    assert.equal(isSecureCookieEnv('production'), true);
  });

  it("n'est pas sécurisé en development", () => {
    assert.equal(isSecureCookieEnv('development'), false);
  });

  it("n'est pas sécurisé en test", () => {
    assert.equal(isSecureCookieEnv('test'), false);
  });
});
