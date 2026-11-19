import { query, queryOne } from '../db/pool.js';
import { isUniqueViolation } from '../db/errors.js';
import { AppError } from '../utils/AppError.js';

export const PUBLIC_COLUMNS = 'id, username, created_at AS "createdAt"';
export const PRIVATE_COLUMNS =
  'id, username, email, created_at AS "createdAt", updated_at AS "updatedAt"';

const UPDATABLE = Object.freeze({
  username: 'username',
  email: 'email',
});

export async function listUsers({ limit, offset }) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, count(*) OVER () AS "totalCount"
       FROM users
      ORDER BY created_at, id
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  const total = rows.length > 0 ? Number(rows[0].totalCount) : await countUsers();
  return { total, items: rows.map(({ totalCount, ...user }) => user) };
}

async function countUsers() {
  const row = await queryOne('SELECT count(*) AS count FROM users');
  return Number(row.count);
}

export async function getPublicUser(id) {
  return findUser(id, PUBLIC_COLUMNS);
}

export async function getPrivateUser(id) {
  return findUser(id, PRIVATE_COLUMNS);
}

async function findUser(id, columns) {
  const user = await queryOne(`SELECT ${columns} FROM users WHERE id = $1`, [id]);
  if (!user) throw AppError.notFound(`Utilisateur ${id} introuvable`);
  return user;
}

export async function updateUser(id, patch) {
  const entries = Object.entries(patch).filter(([field]) => Object.hasOwn(UPDATABLE, field));
  if (entries.length === 0) return getPrivateUser(id);

  const assignments = entries
    .map(([field], i) => `${UPDATABLE[field]} = $${i + 2}`)
    .join(', ');
  const values = entries.map(([, value]) => value);

  try {
    const user = await queryOne(
      `UPDATE users SET ${assignments} WHERE id = $1 RETURNING ${PRIVATE_COLUMNS}`,
      [id, ...values],
    );
    if (!user) throw AppError.notFound(`Utilisateur ${id} introuvable`);
    return user;
  } catch (err) {
    throw toConflict(err) ?? err;
  }
}

export async function deleteUser(id) {
  const { rowCount } = await query('DELETE FROM users WHERE id = $1', [id]);
  if (rowCount === 0) throw AppError.notFound(`Utilisateur ${id} introuvable`);
}

export function toConflict(err) {
  if (isUniqueViolation(err, 'users_username_key')) {
    return AppError.conflict("Ce nom d'utilisateur est déjà pris");
  }
  if (isUniqueViolation(err, 'users_email_key')) {
    return AppError.conflict('Cet email est déjà utilisé');
  }
  return null;
}
