import { AppError } from '../utils/AppError.js';

export function requireSession(req, _res, next) {
  if (req.authMethod !== 'session') {
    return next(AppError.forbidden('Cette action exige une session'));
  }
  return next();
}
