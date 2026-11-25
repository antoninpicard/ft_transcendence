import { randomBytes, createHash } from 'node:crypto';

export const API_KEY_PREFIX = 'trk_';
const PREFIX_LENGTH = 12;
const API_KEY_PATTERN = /^trk_[A-Za-z0-9_-]{43}$/;

export function hashApiKey(key) {
  return createHash('sha256').update(key).digest();
}

export function generateApiKey() {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { key, prefix: key.slice(0, PREFIX_LENGTH), hash: hashApiKey(key) };
}

export function isWellFormedApiKey(value) {
  return typeof value === 'string' && API_KEY_PATTERN.test(value);
}
