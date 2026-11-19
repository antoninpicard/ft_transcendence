import { AppError } from '../utils/AppError.js';

export function notFound(req, _res, next) {
  next(AppError.notFound(`Route inconnue : ${req.method} ${req.originalUrl}`));
}
