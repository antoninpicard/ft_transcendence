import * as authService from '../services/auth.service.js';
import { createSession, revokeSession } from '../services/sessions.service.js';
import { SESSION_COOKIE, sessionCookieOptions, clearCookieOptions } from '../config/cookies.js';

async function openSession(res, user) {
  const { token } = await createSession(user.id);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
}

export async function register(req, res) {
  const user = await authService.register(req.body);
  await openSession(res, user);
  res.status(201).location(`/api/users/${user.id}`).json(user);
}

export async function login(req, res) {
  const user = await authService.verifyCredentials(req.body.identifier, req.body.password);
  await openSession(res, user);
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
