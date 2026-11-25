import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  toBase32,
  fromBase32,
  generateSecret,
  currentStep,
  codeAt,
  findValidStep,
  otpauthUrl,
} from '../../src/utils/totp.js';

const RFC_SECRET = toBase32(Buffer.from('12345678901234567890'));

describe('totp', () => {
  it('encode en base32 comme la RFC 4648', () => {
    assert.equal(toBase32(Buffer.from('foobar')), 'MZXW6YTBOI');
    assert.equal(RFC_SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('décode ce qu\'il encode', () => {
    const bytes = Buffer.from('12345678901234567890');
    assert.deepEqual(fromBase32(toBase32(bytes)), bytes);
  });

  it('donne les codes des vecteurs de test de la RFC 6238 (6 derniers chiffres)', () => {
    const vectors = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
      [20000000000, '353130'],
    ];
    for (const [seconds, code] of vectors) {
      assert.equal(codeAt(RFC_SECRET, currentStep(seconds * 1000)), code);
    }
  });

  it('génère un secret de 160 bits (32 caractères base32)', () => {
    const secret = generateSecret();
    assert.match(secret, /^[A-Z2-7]{32}$/);
    assert.notEqual(secret, generateSecret());
  });

  it('accepte le code courant et un pas de décalage, pas deux', () => {
    const now = 1111111111 * 1000;
    const step = currentStep(now);
    assert.equal(findValidStep(RFC_SECRET, codeAt(RFC_SECRET, step), null, now), step);
    assert.equal(findValidStep(RFC_SECRET, codeAt(RFC_SECRET, step - 1), null, now), step - 1);
    assert.equal(findValidStep(RFC_SECRET, codeAt(RFC_SECRET, step + 1), null, now), step + 1);
    assert.equal(findValidStep(RFC_SECRET, codeAt(RFC_SECRET, step - 2), null, now), null);
  });

  it('refuse un code déjà utilisé', () => {
    const now = 1111111111 * 1000;
    const step = currentStep(now);
    assert.equal(findValidStep(RFC_SECRET, codeAt(RFC_SECRET, step), step, now), null);
  });

  it('construit le lien otpauth du QR code', () => {
    assert.equal(
      otpauthUrl('ABC', 'anto'),
      'otpauth://totp/CLB%20Private%20Club%3Aanto?secret=ABC&issuer=CLB%20Private%20Club',
    );
  });
});
