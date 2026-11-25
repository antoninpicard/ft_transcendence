import { query, queryOne } from '../db/pool.js';
import { isUniqueViolation, PG_FOREIGN_KEY_VIOLATION } from '../db/errors.js';
import { AppError } from '../utils/AppError.js';
import { getPublicUser } from './users.service.js';

const PAIR = `LEAST(requester_id, addressee_id) = LEAST($1::uuid, $2::uuid)
          AND GREATEST(requester_id, addressee_id) = GREATEST($1::uuid, $2::uuid)`;

export const FRIEND_COLUMNS = `u.id, u.username, u.created_at AS "createdAt"`;

export async function listFriends(userId) {
  const { rows } = await query(
    `SELECT ${FRIEND_COLUMNS}, f.accepted_at AS since
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
      WHERE f.status = 'accepted' AND $1 IN (f.requester_id, f.addressee_id)
      ORDER BY f.accepted_at DESC, u.id`,
    [userId],
  );
  return rows.map(({ since, ...user }) => ({ user, since }));
}

export async function listFriendRequests(userId) {
  const incoming = await listPending(userId, 'addressee_id', 'requester_id');
  const outgoing = await listPending(userId, 'requester_id', 'addressee_id');
  return { incoming, outgoing };
}

async function listPending(userId, ownColumn, otherColumn) {
  const { rows } = await query(
    `SELECT ${FRIEND_COLUMNS}, f.created_at AS "requestedAt"
       FROM friendships f
       JOIN users u ON u.id = f.${otherColumn}
      WHERE f.status = 'pending' AND f.${ownColumn} = $1
      ORDER BY f.created_at DESC, u.id`,
    [userId],
  );
  return rows.map(({ requestedAt, ...user }) => ({ user, createdAt: requestedAt }));
}

export async function sendFriendRequest(userId, targetId) {
  if (userId === targetId) {
    throw AppError.badRequest("Impossible de s'envoyer une demande à soi-même");
  }
  const user = await getPublicUser(targetId);

  try {
    await query(
      `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'pending')`,
      [userId, targetId],
    );
    return { status: 'pending', user };
  } catch (err) {
    if (err?.code === PG_FOREIGN_KEY_VIOLATION) {
      throw AppError.notFound(`Utilisateur ${targetId} introuvable`);
    }
    if (!isUniqueViolation(err, 'friendships_pair_key')) throw err;
  }

  if (await acceptPending(userId, targetId)) return { status: 'accepted', user };
  throw AppError.conflict('Vous êtes déjà amis ou une demande est déjà en cours');
}

async function acceptPending(userId, requesterId) {
  const row = await queryOne(
    `UPDATE friendships
        SET status = 'accepted', accepted_at = now()
      WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'
      RETURNING id`,
    [requesterId, userId],
  );
  return Boolean(row);
}

export async function acceptFriendRequest(userId, requesterId) {
  if (!(await acceptPending(userId, requesterId))) {
    throw AppError.notFound('Aucune demande en attente de cet utilisateur');
  }
  return { status: 'accepted', user: await getPublicUser(requesterId) };
}

export async function deleteFriendRequest(userId, otherId) {
  const { rowCount } = await query(
    `DELETE FROM friendships
      WHERE status = 'pending'
        AND ${PAIR}`,
    [userId, otherId],
  );
  if (rowCount === 0) throw AppError.notFound('Aucune demande en attente avec cet utilisateur');
}

export async function removeFriend(userId, friendId) {
  const { rowCount } = await query(
    `DELETE FROM friendships
      WHERE status = 'accepted'
        AND ${PAIR}`,
    [userId, friendId],
  );
  if (rowCount === 0) throw AppError.notFound("Cet utilisateur n'est pas dans vos amis");
}

export async function getRelation(viewerId, targetId) {
  if (viewerId === targetId) return 'self';
  const row = await queryOne(
    `SELECT requester_id AS "requesterId", status
       FROM friendships
      WHERE ${PAIR}`,
    [viewerId, targetId],
  );
  if (!row) return 'none';
  if (row.status === 'accepted') return 'friends';
  return row.requesterId === viewerId ? 'request-sent' : 'request-received';
}

export async function areFriends(a, b) {
  const row = await queryOne(
    `SELECT 1 AS found
       FROM friendships
      WHERE status = 'accepted' AND ${PAIR}`,
    [a, b],
  );
  return Boolean(row);
}
