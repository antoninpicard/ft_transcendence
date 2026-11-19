import { AppError } from '../utils/AppError.js';

export function methodNotAllowed(...allowed) {
  return (req, res, next) => {
    res.set('Allow', allowed.join(', '));
    next(AppError.methodNotAllowed(`Méthode ${req.method} non autorisée sur cette ressource`));
  };
}
