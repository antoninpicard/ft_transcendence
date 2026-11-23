import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { rateLimit as createRateLimit, ipKeyGenerator } from 'express-rate-limit';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { authenticate } from './middlewares/authenticate.js';
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

  app.use('/api', noStore);
  app.use('/api', authenticate);

  if (rateLimit) {
    app.use(
      '/api',
      limiter({
        windowMs: 60_000,
        limit: 60,
        keyGenerator: (req) => req.apiKeyId,
        skip: (req) => req.authMethod !== 'apiKey',
      }),
    );
    app.post('/api/auth/login', limiter({ windowMs: 60_000, limit: 10, keyGenerator: loginKey }));
    app.post('/api/auth/register', limiter({ windowMs: 60_000, limit: 5 }));
    app.post('/api/badge/login', limiter({ windowMs: 10_000, limit: 1 }));
  }

  app.use('/api', apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

function loginKey(req) {
  const ip = ipKeyGenerator(req.ip);
  const identifier = req.body?.identifier;
  if (typeof identifier !== 'string') return ip;
  return JSON.stringify([ip, identifier.trim().toLowerCase()]);
}

function limiter({ windowMs, limit, keyGenerator, skip }) {
  return createRateLimit({
    windowMs,
    limit,
    ...(keyGenerator ? { keyGenerator } : {}),
    ...(skip ? { skip } : {}),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => next(AppError.tooManyRequests()),
  });
}
