// Rules of the scratch game, as pure functions: no HTTP, no SQL (tested in tests/unit/gameRules.test.js)
import { randomInt } from 'node:crypto';
import { QTE_KEYS, TICKETS } from '../schemas/game.schema.js';

// Fastest accepted scratching, per key: below this, the keys were not typed by a person
export const MIN_MS_PER_KEY = 150;

// A ticket not revealed within this delay is lost
export const TICKET_TTL_MS = 10 * 60_000;

export function findTicket(id) {
  return TICKETS.find((ticket) => ticket.id === id);
}

// Drawn with the crypto RNG: the sequence is the secret the player has to type back
export function drawSequence(length, random = randomInt) {
  return Array.from({ length }, () => QTE_KEYS[random(QTE_KEYS.length)]).join('');
}

export function minRevealMs(sequence) {
  return sequence.length * MIN_MS_PER_KEY;
}
