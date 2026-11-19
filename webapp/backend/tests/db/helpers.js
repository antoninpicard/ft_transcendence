import { randomBytes } from 'node:crypto';
import { query } from '../../src/db/pool.js';

export function uniqueUser() {
  const suffix = randomBytes(6).toString('hex');
  return {
    username: `test-${suffix}`,
    email: `test-${suffix}@example.test`,
    password: 'motdepasse-de-test',
  };
}

export async function cleanupUsers(usernames) {
  if (usernames.length === 0) return;
  await query('DELETE FROM users WHERE username = ANY($1)', [usernames]);
}
