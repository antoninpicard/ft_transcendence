import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import {
  OAUTH_STATE_COOKIE,
  oauthStateCookieOptions,
  clearOauthStateCookieOptions,
} from '../config/cookies.js';
import { AppError } from '../utils/AppError.js';
import { buildAuthorizeUrl, exchangeCode, fetchProfile } from '../services/fortytwo.client.js';
import { findOrCreateFortyTwoUser } from '../services/oauth.service.js';
import { openSessionOrAskCode } from './openSessionOrAskCode.js';

function sha256(value) {
  return createHash('sha256').update(value).digest();
}

function sameState(received, expected) {
  if (typeof received !== 'string' || typeof expected !== 'string') return false;
  return timingSafeEqual(sha256(received), sha256(expected));
}

function failure(res, code) {
  res.redirect(`${env.FRONT_URL}/login?oauth_error=${code}`);
}

export function start(_req, res) {
  if (!env.fortyTwoConfigured) {
    throw AppError.serviceUnavailable('Connexion avec 42 indisponible');
  }
  const state = randomBytes(16).toString('hex');
  res.cookie(OAUTH_STATE_COOKIE, state, oauthStateCookieOptions);
  res.redirect(buildAuthorizeUrl(state));
}

export async function callback(req, res) {
  res.clearCookie(OAUTH_STATE_COOKIE, clearOauthStateCookieOptions);
  if (!env.fortyTwoConfigured) return failure(res, 'oauth_unavailable');

  const { state, error, code } = req.query;
  if (!sameState(state, req.cookies?.[OAUTH_STATE_COOKIE])) return failure(res, 'oauth_state');
  if (error !== undefined) return failure(res, 'oauth_denied');
  if (typeof code !== 'string' || code === '') return failure(res, 'oauth_state');

  try {
    const accessToken = await exchangeCode(code);
    const profile = await fetchProfile(accessToken);
    if (
      !Number.isInteger(profile.id) ||
      typeof profile.email !== 'string' ||
      profile.email === ''
    ) {
      return failure(res, 'oauth_unavailable');
    }
    const user = await findOrCreateFortyTwoUser({
      fortytwoId: profile.id,
      email: profile.email,
      login: profile.login,
    });
    if (await openSessionOrAskCode(res, user.id)) return res.redirect(`${env.FRONT_URL}/login/2fa`);
    res.redirect(`${env.FRONT_URL}/home`);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 409) return failure(res, 'oauth_email_taken');
    console.error('[oauth 42]', err?.name, err?.message);
    return failure(res, 'oauth_unavailable');
  }
}
