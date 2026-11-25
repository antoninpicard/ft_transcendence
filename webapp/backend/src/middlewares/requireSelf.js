import { AppError } from '../utils/AppError.js';

export function requireSelf(req, _res, next) {
  if (req.user.id !== req.params.id) {
    return next(AppError.forbidden('Ce compte ne vous appartient pas'));
  }
  return next();
}
