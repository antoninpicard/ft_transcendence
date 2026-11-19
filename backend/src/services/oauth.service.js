import { randomBytes } from 'node:crypto';
import { queryOne } from '../db/pool.js';
import { isUniqueViolation } from '../db/errors.js';
import { AppError } from '../utils/AppError.js';
import { PRIVATE_COLUMNS } from './users.service.js';
import { USERNAME_MAX, USERNAME_MIN, USERNAME_PATTERN } from '../schemas/users.schema.js';

const MAX_USERNAME_ATTEMPTS = 5;
const SUFFIXED_BASE_LENGTH = USERNAME_MAX - 5;

function randomSuffix() {
  return randomBytes(2).toString('hex');
}

function isValidUsername(login) {
  return (
    typeof login === 'string' &&
    login.length >= USERNAME_MIN &&
    login.length <= USERNAME_MAX &&
    USERNAME_PATTERN.test(login)
  );
}

function findByFortyTwoId(fortytwoId) {
  return queryOne(`SELECT ${PRIVATE_COLUMNS} FROM users WHERE fortytwo_id = $1`, [fortytwoId]);
}

export async function findOrCreateFortyTwoUser({ fortytwoId, email, login }) {
  const existing = await findByFortyTwoId(fortytwoId);
  if (existing) return existing;

  const validLogin = isValidUsername(login);
  const base = validLogin ? login : 'user';

  for (let attempt = 0; attempt < MAX_USERNAME_ATTEMPTS; attempt += 1) {
    const username =
      attempt === 0 && validLogin
        ? base
        : `${base.slice(0, SUFFIXED_BASE_LENGTH)}-${randomSuffix()}`;

    try {
      return await queryOne(
        `INSERT INTO users (username, email, fortytwo_id)
         VALUES ($1, $2, $3)
         RETURNING ${PRIVATE_COLUMNS}`,
        [username, email, fortytwoId],
      );
    } catch (err) {
      if (isUniqueViolation(err, 'users_username_key')) continue;
      if (isUniqueViolation(err, 'users_email_key')) {
        throw AppError.conflict('Cet email est déjà utilisé par un autre compte');
      }
      if (isUniqueViolation(err, 'users_fortytwo_id_key')) {
        const concurrent = await findByFortyTwoId(fortytwoId);
        if (concurrent) return concurrent;
      }
      throw err;
    }
  }

  throw AppError.conflict("Impossible de générer un nom d'utilisateur disponible");
}
