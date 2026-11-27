import { z } from 'zod';

// The only definition of the scratch tickets: the front renders this catalog
// (GET /api/game/catalog) and the server pays from it. Only the images live in the front.
export const TICKETS = Object.freeze([
  { id: 'etoile-filante', name: 'Étoile Filante', price: '5 €', level: 'Débutant', keys: 4, points: 10 },
  { id: 'diamant-rouge', name: 'Diamant Rouge', price: '10 €', level: 'Classique', keys: 7, points: 25 },
  { id: 'royale', name: 'Royale', price: '20 €', level: 'Chaperonné', keys: 10, points: 50 },
]);

// Keys a sequence is drawn from (home row of the keyboard)
export const QTE_KEYS = Object.freeze(['A', 'S', 'D', 'F', 'J', 'K', 'L']);

export const LEADERBOARD_SIZE = 5;

export const ticketBody = z.object({
  ticket: z.enum(TICKETS.map((t) => t.id)),
});

export const ticketIdParams = z.object({ id: z.uuid().toLowerCase() });

export const revealBody = z.object({
  keys: z
    .string()
    .toUpperCase()
    .regex(new RegExp(`^[${QTE_KEYS.join('')}]{1,32}$`)),
});
