import { AppError } from '../utils/AppError.js';
import { isWellFormedApiKey } from '../utils/apiKey.js';
import { resolveApiKey } from '../services/apiKeys.service.js';
import { resolveSession } from '../services/sessions.service.js';
import { getPrivateUser } from '../services/users.service.js';
import { SESSION_COOKIE } from '../config/cookies.js';

const BEARER_PREFIX = 'Bearer ';

export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization;
    if (header !== undefined) {
      await authenticateByKey(req, header);
      return next();
    }

    const session = await resolveSession(req.cookies?.[SESSION_COOKIE]);
    if (session) {
      req.user = await getPrivateUser(session.userId);
      req.authMethod = 'session';
      req.sessionId = session.id;
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

async function authenticateByKey(req, header) {
  const key = header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : null;
  const apiKey = isWellFormedApiKey(key) ? await resolveApiKey(key) : null;
  if (!apiKey) throw AppError.unauthorized('Clé d API invalide');

  req.user = await getPrivateUser(apiKey.userId);
  req.authMethod = 'apiKey';
  req.apiKeyId = apiKey.id;
}
