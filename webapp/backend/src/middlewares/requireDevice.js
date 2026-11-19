import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

function sha256(value) {
  return createHash('sha256').update(value).digest();
}

export function requireDevice(req, _res, next) {
  const received = req.get('x-device-token');
  if (typeof received !== 'string' || !timingSafeEqual(sha256(received), sha256(env.DEVICE_TOKEN))) {
    return next(AppError.unauthorized('Appareil non autorisé'));
  }
  return next();
}
