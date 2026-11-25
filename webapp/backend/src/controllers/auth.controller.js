import * as authService from '../services/auth.service.js';
import { revokeSession } from '../services/sessions.service.js';
import { openSession } from './openSession.js';
import { openSessionOrAskCode } from './openSessionOrAskCode.js';
import { SESSION_COOKIE, clearCookieOptions } from '../config/cookies.js';

export async function register(req, res) {
  const user = await authService.register(req.body);
  await openSession(res, user.id);
  res.status(201).location(`/api/users/${user.id}`).json(user);
}

export async function login(req, res) {
  const user = await authService.verifyCredentials(req.body.identifier, req.body.password);
  if (await openSessionOrAskCode(res, user.id)) return res.json({ twoFactorRequired: true });
  res.json(user);
}

export async function logout(req, res) {
  await revokeSession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, clearCookieOptions);
  res.status(204).end();
}

export async function me(req, res) {
  res.json(req.user);
}

export async function session(req, res) {
  res.json({ user: req.authMethod === 'session' ? req.user : null });
}
