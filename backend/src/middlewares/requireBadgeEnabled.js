import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export function requireBadgeEnabled(_req, _res, next) {
  if (!env.badgeConfigured) {
    return next(AppError.serviceUnavailable('Badgeuse indisponible'));
  }
  return next();
}
