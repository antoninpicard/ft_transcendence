import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { rateLimit as createRateLimit } from 'express-rate-limit';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { AppError } from './utils/AppError.js';
import { createBadgeActions } from './services/badgeActions.js';
import * as badgesService from './services/badges.service.js';

export function createApp({ rateLimit = env.NODE_ENV !== 'test' } = {}) {
  const app = express();

  app.set('trust proxy', 1);
  app.locals.badgeActions = createBadgeActions({ store: badgesService });

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: env.corsCredentials }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') {
    app.use(
      morgan(env.isProd ? 'combined' : 'dev', {
        skip: (req) => req.originalUrl.startsWith('/api/auth/42/callback'),
      }),
    );
  }

  if (rateLimit) {
    app.post('/api/auth/login', limiter({ windowMs: 60_000, limit: 10 }));
    app.post('/api/auth/register', limiter({ windowMs: 60_000, limit: 5 }));
    app.post('/api/badge/login', limiter({ windowMs: 10_000, limit: 1 }));
  }

  app.use('/api', noStore, apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

function limiter({ windowMs, limit }) {
  return createRateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => next(AppError.tooManyRequests()),
  });
}
