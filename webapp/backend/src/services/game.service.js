import { query, queryOne } from '../db/pool.js';
import { PG_FOREIGN_KEY_VIOLATION } from '../db/errors.js';
import { AppError } from '../utils/AppError.js';
import { LEADERBOARD_SIZE, QTE_KEYS, TICKETS } from '../schemas/game.schema.js';
import { drawSequence, findTicket, minRevealMs, TICKET_TTL_MS } from './gameRules.js';

export function getCatalog() {
  return { keys: QTE_KEYS, items: TICKETS };
}

// Buys a ticket: the server draws its sequence and fixes its points. The points are not
// returned: the player learns them when the ticket is revealed. A ticket still in progress
// is replaced (one per player, enforced by the ticket_plays_one_pending_idx index).
export async function startTicket(userId, ticketId) {
  const ticket = findTicket(ticketId);
  const sequence = drawSequence(ticket.keys);
  try {
    return await queryOne(
      `INSERT INTO ticket_plays (user_id, ticket, points, sequence) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) WHERE revealed_at IS NULL
       DO UPDATE SET id = gen_random_uuid(), ticket = EXCLUDED.ticket, points = EXCLUDED.points,
                     sequence = EXCLUDED.sequence, created_at = now()
       RETURNING id, ticket, sequence`,
      [userId, ticket.id, ticket.points, sequence],
    );
  } catch (err) {
    // The account was deleted between authentication and the insert
    if (err?.code === PG_FOREIGN_KEY_VIOLATION) throw AppError.unauthorized();
    throw err;
  }
}

// Reveals a ticket. Every condition is in the UPDATE itself, so two parallel reveals of the
// same ticket cannot both pay. Times are compared with the database clock only.
export async function revealTicket(userId, playId, keys) {
  const revealed = await queryOne(
    `UPDATE ticket_plays SET revealed_at = now()
      WHERE id = $1 AND user_id = $2 AND revealed_at IS NULL
        AND sequence = $3
        AND created_at > now() - make_interval(secs => $4)
        AND created_at <= now() - make_interval(secs => $5)
      RETURNING ticket, points`,
    [playId, userId, keys, TICKET_TTL_MS / 1000, minRevealMs(keys) / 1000],
  );
  if (revealed) return revealed;
  throw await whyNotRevealed(userId, playId, keys);
}

async function whyNotRevealed(userId, playId, keys) {
  const play = await queryOne(
    `SELECT sequence, revealed_at IS NOT NULL AS revealed,
            created_at <= now() - make_interval(secs => $3) AS expired,
            created_at > now() - make_interval(secs => $4) AS "tooFast"
       FROM ticket_plays WHERE id = $1 AND user_id = $2`,
    [playId, userId, TICKET_TTL_MS / 1000, minRevealMs(keys) / 1000],
  );
  // Someone else's ticket reads as missing: its existence is not revealed
  if (!play || play.expired) return AppError.notFound('Ticket introuvable ou expiré');
  if (play.revealed) return AppError.conflict('Ce ticket est déjà ouvert');
  if (play.sequence !== keys) return AppError.badRequest('Séquence incorrecte');
  if (play.tooFast) return AppError.badRequest('Grattage trop rapide');
  // The state changed between the UPDATE and this SELECT (a parallel reveal)
  return AppError.conflict('Ce ticket est déjà ouvert');
}

// The top players, plus the caller's own rank and score (rank null before their first ticket).
// Only revealed tickets count. RANK() gives the same rank to equal scores; the position
// (ROW_NUMBER) only cuts the list.
export async function getLeaderboard(userId, size = LEADERBOARD_SIZE) {
  const { rows } = await query(
    `WITH scores AS (
       SELECT user_id, SUM(points) AS score
         FROM ticket_plays
        WHERE revealed_at IS NOT NULL
        GROUP BY user_id
     ), ranked AS (
       SELECT s.user_id, u.username, s.score,
              RANK() OVER (ORDER BY s.score DESC) AS rank,
              ROW_NUMBER() OVER (ORDER BY s.score DESC, u.username, u.id) AS position
         FROM scores s
         JOIN users u ON u.id = s.user_id
     )
     SELECT user_id AS "userId", username, score, rank, position
       FROM ranked
      WHERE position <= $2 OR user_id = $1
      ORDER BY position`,
    [userId, size],
  );

  const entries = rows.map((row) => ({
    rank: Number(row.rank),
    position: Number(row.position),
    user: { id: row.userId, username: row.username },
    score: Number(row.score),
  }));
  const mine = entries.find((entry) => entry.user.id === userId);

  return {
    top: entries
      .filter((entry) => entry.position <= size)
      .map(({ position, ...entry }) => entry),
    me: mine ? { rank: mine.rank, score: mine.score } : { rank: null, score: 0 },
  };
}
