import { env } from './env.js';
import { SESSION_TTL_MS } from '../services/sessions.service.js';

export const SESSION_COOKIE = 'sid';

export const clearCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProd,
  path: '/',
};

export const sessionCookieOptions = {
  ...clearCookieOptions,
  maxAge: SESSION_TTL_MS,
};
