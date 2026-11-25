import { query, queryOne } from '../db/pool.js';
import { PG_FOREIGN_KEY_VIOLATION } from '../db/errors.js';
import { AppError } from '../utils/AppError.js';
import { getPublicUser } from './users.service.js';
import { areFriends, FRIEND_COLUMNS } from './friends.service.js';

export { MESSAGE_MAX } from '../schemas/messages.schema.js';

const MESSAGE_COLUMNS = `id, sender_id AS "senderId", recipient_id AS "recipientId", body, created_at AS "createdAt"`;

const PAIR = `LEAST(sender_id, recipient_id) = LEAST($1::uuid, $2::uuid)
          AND GREATEST(sender_id, recipient_id) = GREATEST($1::uuid, $2::uuid)`;

export async function sendMessage(senderId, recipientId, body) {
  if (senderId === recipientId) {
    throw AppError.badRequest("Impossible de s'envoyer un message à soi-même");
  }
  await getPublicUser(recipientId);
  if (!(await areFriends(senderId, recipientId))) {
    throw AppError.forbidden("Vous ne pouvez écrire qu'à vos amis");
  }
  try {
    return await queryOne(
      `INSERT INTO messages (sender_id, recipient_id, body) VALUES ($1, $2, $3)
       RETURNING ${MESSAGE_COLUMNS}`,
      [senderId, recipientId, body],
    );
  } catch (err) {
    if (err?.code === PG_FOREIGN_KEY_VIOLATION) {
      throw AppError.notFound(`Utilisateur ${recipientId} introuvable`);
    }
    throw err;
  }
}

export async function listConversations(userId) {
  const { rows } = await query(
    `SELECT ${FRIEND_COLUMNS},
            m.id AS "messageId", m.sender_id AS "senderId", m.recipient_id AS "recipientId",
            m.body, m.created_at AS "messageCreatedAt"
       FROM (
         SELECT DISTINCT ON (CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END)
                id, sender_id, recipient_id, body, created_at,
                CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other_id
           FROM messages
          WHERE $1 IN (sender_id, recipient_id)
          ORDER BY CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END,
                   created_at DESC, id DESC
       ) m
       JOIN users u ON u.id = m.other_id
      ORDER BY m.created_at DESC, m.id DESC`,
    [userId],
  );
  return rows.map((row) => ({
    user: { id: row.id, username: row.username, createdAt: row.createdAt },
    lastMessage: {
      id: row.messageId,
      senderId: row.senderId,
      recipientId: row.recipientId,
      body: row.body,
      createdAt: row.messageCreatedAt,
    },
  }));
}

export async function getConversation(userId, otherId, { after, before, limit = 50 } = {}) {
  if (after && before) {
    throw AppError.badRequest('after et before sont incompatibles');
  }
  const cursor = after ?? before;
  if (cursor) {
    const found = await queryOne(`SELECT 1 AS found FROM messages WHERE id = $3 AND ${PAIR}`, [
      userId,
      otherId,
      cursor,
    ]);
    if (!found) throw AppError.badRequest('Curseur inconnu dans cette conversation');
  }

  const cursorRow = `(SELECT c.created_at, c.id FROM messages c WHERE c.id = $4)`;
  let condition = '';
  let order = 'DESC';
  const params = [userId, otherId, limit];
  if (after) {
    condition = `AND (created_at, id) > ${cursorRow}`;
    order = 'ASC';
    params.push(after);
  } else if (before) {
    condition = `AND (created_at, id) < ${cursorRow}`;
    params.push(before);
  }

  const { rows } = await query(
    `SELECT ${MESSAGE_COLUMNS}
       FROM messages
      WHERE ${PAIR} ${condition}
      ORDER BY created_at ${order}, id ${order}
      LIMIT $3`,
    params,
  );
  return order === 'DESC' ? rows.reverse() : rows;
}
