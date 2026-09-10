import { SESSION_TTL_MS } from '../services/sessions.service.js';

export const SESSION_COOKIE = 'sid';

const NON_PRODUCTION_ENVS = new Set(['development', 'test']);

export function isSecureCookieEnv(nodeEnv) {
  return !NON_PRODUCTION_ENVS.has(nodeEnv);
}

export const clearCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isSecureCookieEnv(process.env.NODE_ENV),
  path: '/',
};

export const sessionCookieOptions = {
  ...clearCookieOptions,
  maxAge: SESSION_TTL_MS,
};
