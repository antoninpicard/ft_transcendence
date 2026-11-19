import { createSession } from '../services/sessions.service.js';
import { SESSION_COOKIE, sessionCookieOptions } from '../config/cookies.js';

export async function openSession(res, userId) {
  const { token } = await createSession(userId);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
}
