import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { queryOne } from '../db/pool.js';
import { AppError } from '../utils/AppError.js';
import { PRIVATE_COLUMNS, toConflict } from './users.service.js';

const HASH_OPTIONS = { type: argon2.argon2id };
const INVALID_CREDENTIALS = 'Identifiants invalides';

let decoyHash;

async function decoy() {
  if (decoyHash === undefined) {
    decoyHash = await argon2.hash(randomBytes(32).toString('hex'), HASH_OPTIONS);
  }
  return decoyHash;
}

export async function register({ username, email, password }) {
  const passwordHash = await argon2.hash(password, HASH_OPTIONS);

  try {
    return await queryOne(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3) RETURNING ${PRIVATE_COLUMNS}`,
      [username, email, passwordHash],
    );
  } catch (err) {
    throw toConflict(err) ?? err;
  }
}

export async function verifyCredentials(identifier, password) {
  const row = await queryOne(
    `SELECT ${PRIVATE_COLUMNS}, password_hash AS "passwordHash"
       FROM users WHERE email = $1 OR username = $1`,
    [identifier],
  );

  if (!row) {
    await verify(await decoy(), password);
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }

  const { passwordHash, ...user } = row;
  if (!(await verify(passwordHash, password))) {
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }

  return user;
}

async function verify(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
