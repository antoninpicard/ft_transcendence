import { AppError } from '../utils/AppError.js';
import { resolveSession } from '../services/sessions.service.js';
import { getPrivateUser } from '../services/users.service.js';
import { SESSION_COOKIE } from '../config/cookies.js';

export async function requireAuth(req, _res, next) {
  try {
    const session = await resolveSession(req.cookies?.[SESSION_COOKIE]);
    if (!session) return next(AppError.unauthorized());

    req.user = await getPrivateUser(session.userId);
    req.sessionId = session.id;
    return next();
  } catch (err) {
    return next(err);
  }
}
