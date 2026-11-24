import { AppError } from '../utils/AppError.js';

function classify(err) {
  if (err instanceof AppError) {
    return { statusCode: err.statusCode, message: err.message, details: err.details };
  }

  const status = err?.status ?? err?.statusCode;
  if (err?.expose === true && Number.isInteger(status) && status >= 400 && status < 500) {
    return { statusCode: status, message: err.message };
  }

  return null;
}

export function errorHandler(err, req, res, next) {
  const known = classify(err);
  const statusCode = known?.statusCode ?? 500;

  if (!known || statusCode >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  if (res.headersSent) return next(err);

  res.status(statusCode).json({
    error: {
      message: known ? known.message : 'Erreur interne du serveur',
      ...(known?.details ? { details: known.details } : {}),
    },
  });
}
