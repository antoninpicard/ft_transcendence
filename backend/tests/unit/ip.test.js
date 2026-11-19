import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIp, parseIpList } from '../../src/utils/ip.js';

describe('normalisation des adresses IP', () => {
  it('retire le préfixe IPv4 mappé en IPv6', () => {
    assert.equal(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1');
    assert.equal(normalizeIp('::FFFF:10.0.0.7'), '10.0.0.7');
  });

  it('garde une adresse IPv4 telle quelle', () => {
    assert.equal(normalizeIp(' 10.0.0.7 '), '10.0.0.7');
  });

  it('met une adresse IPv6 sous forme canonique', () => {
    assert.equal(normalizeIp('2001:DB8:0:0:0:0:0:7'), '2001:db8::7');
    assert.equal(normalizeIp('::1'), '::1');
  });

  it('rejette ce qui n est pas une adresse IP', () => {
    for (const value of [undefined, null, '', 'borne.local', '10.0.0.0/24', '::ffff:borne', 42]) {
      assert.equal(normalizeIp(value), null, String(value));
    }
  });

  it('lit une liste séparée par des virgules', () => {
    assert.deepEqual(
      [...parseIpList(' 10.0.0.7 , ::ffff:10.0.0.8,,10.0.0.7')],
      ['10.0.0.7', '10.0.0.8'],
    );
    assert.equal(parseIpList(undefined).size, 0);
    assert.equal(parseIpList(' , ').size, 0);
  });
});
