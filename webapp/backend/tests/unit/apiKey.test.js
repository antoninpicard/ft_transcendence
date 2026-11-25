import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_KEY_PREFIX,
  generateApiKey,
  hashApiKey,
  isWellFormedApiKey,
} from '../../src/utils/apiKey.js';

describe('apiKey', () => {
  it('génère une clé au bon format', () => {
    const { key } = generateApiKey();
    assert.equal(API_KEY_PREFIX, 'trk_');
    assert.equal(isWellFormedApiKey(key), true);
    assert.ok(key.startsWith('trk_'));
    assert.equal(key.length, 47);
  });

  it('dérive le préfixe des 12 premiers caractères', () => {
    const { key, prefix } = generateApiKey();
    assert.equal(prefix, key.slice(0, 12));
  });

  it('hache la clé en SHA-256', () => {
    const { key, hash } = generateApiKey();
    assert.equal(hash.length, 32);
    assert.ok(hash.equals(hashApiKey(key)));
    assert.ok(!hash.toString('hex').includes(key));
  });

  it('génère des clés différentes', () => {
    assert.notEqual(generateApiKey().key, generateApiKey().key);
  });

  it('rejette les formats invalides', () => {
    const valid = generateApiKey().key;
    for (const value of ['trk_court', 'abc', `${valid.slice(0, -1)}+`, `${valid}x`, null, undefined, 42, {}]) {
      assert.equal(isWellFormedApiKey(value), false);
    }
  });
});
