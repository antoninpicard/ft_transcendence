import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashBadgeUid } from '../../src/services/badgeUid.js';

describe('hashBadgeUid', () => {
  it('ignore la casse de l\'UID', () => {
    assert.deepEqual(hashBadgeUid('ab12cd', 's'), hashBadgeUid('AB12CD', 's'));
  });

  it('dépend du secret', () => {
    assert.notDeepEqual(hashBadgeUid('AB12CD', 'un'), hashBadgeUid('AB12CD', 'deux'));
  });

  it('produit 32 octets', () => {
    const hash = hashBadgeUid('AB12CD', 's');
    assert.ok(Buffer.isBuffer(hash));
    assert.equal(hash.length, 32);
  });

  it('ne contient pas l\'UID', () => {
    const hash = hashBadgeUid('AB12CD', 's');
    assert.equal(hash.includes(Buffer.from('AB12CD')), false);
    assert.equal(hash.toString('hex').includes('ab12cd'), false);
  });
});
