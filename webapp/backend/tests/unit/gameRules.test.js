import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { drawSequence, findTicket, minRevealMs, MIN_MS_PER_KEY } from '../../src/services/gameRules.js';
import { QTE_KEYS, TICKETS, revealBody, ticketBody } from '../../src/schemas/game.schema.js';

describe('règles du jeu', () => {
  it('tire une séquence de la bonne longueur, avec les touches autorisées', () => {
    for (const ticket of TICKETS) {
      const sequence = drawSequence(ticket.keys);
      assert.equal(sequence.length, ticket.keys);
      for (const key of sequence) assert.ok(QTE_KEYS.includes(key), key);
    }
  });

  it('utilise le générateur fourni', () => {
    assert.equal(drawSequence(3, () => 0), 'AAA');
    assert.equal(drawSequence(2, () => QTE_KEYS.length - 1), 'LL');
  });

  it('exige un temps minimal proportionnel au nombre de touches', () => {
    assert.equal(minRevealMs('ASDF'), 4 * MIN_MS_PER_KEY);
  });

  it('trouve un ticket par son id', () => {
    assert.equal(findTicket('royale').points, 50);
    assert.equal(findTicket('jackpot'), undefined);
  });

  it('a un catalogue cohérent', () => {
    const ids = TICKETS.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const t of TICKETS) {
      assert.ok(Number.isInteger(t.points) && t.points > 0);
      assert.ok(Number.isInteger(t.keys) && t.keys > 0 && t.keys <= 32);
    }
  });

  it('valide le corps des requêtes', () => {
    assert.ok(ticketBody.safeParse({ ticket: 'royale' }).success);
    assert.ok(!ticketBody.safeParse({ ticket: 'jackpot' }).success);
    assert.equal(revealBody.parse({ keys: 'asdf' }).keys, 'ASDF');
    assert.ok(!revealBody.safeParse({ keys: 'AXDF' }).success);
    assert.ok(!revealBody.safeParse({ keys: '' }).success);
  });
});
