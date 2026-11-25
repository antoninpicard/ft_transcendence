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

export const OAUTH_STATE_COOKIE = 'oauth_state';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export const clearOauthStateCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isSecureCookieEnv(process.env.NODE_ENV),
  path: '/api/auth/42',
};

export const oauthStateCookieOptions = {
  ...clearOauthStateCookieOptions,
  maxAge: OAUTH_STATE_TTL_MS,
};

export const TWO_FACTOR_COOKIE = 'twofa_pending';

const TWO_FACTOR_TTL_MS = 5 * 60 * 1000;

export const clearTwoFactorCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isSecureCookieEnv(process.env.NODE_ENV),
  path: '/api/auth/2fa',
};

export const twoFactorCookieOptions = {
  ...clearTwoFactorCookieOptions,
  maxAge: TWO_FACTOR_TTL_MS,
};
