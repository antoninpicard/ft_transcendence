import { AppError } from '../utils/AppError.js';

export function requireAuth(req, _res, next) {
  if (!req.user) return next(AppError.unauthorized());
  return next();
}
