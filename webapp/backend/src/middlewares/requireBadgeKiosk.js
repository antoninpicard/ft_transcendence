import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { normalizeIp } from '../utils/ip.js';

export function requireBadgeKiosk(req, _res, next) {
  if (env.badgeLoginAllowedIps.size === 0) {
    return next(AppError.serviceUnavailable('Connexion par badge indisponible'));
  }
  if (!env.badgeLoginAllowedIps.has(normalizeIp(req.ip))) {
    return next(AppError.forbidden('Connexion par badge réservée à la borne'));
  }
  return next();
}
