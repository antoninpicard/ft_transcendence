import { Router } from 'express';
import { checkConnection } from '../db/pool.js';
import { usersRouter } from './users.routes.js';

export const apiRouter = Router();

apiRouter.get('/health', async (_req, res) => {
  let database = 'ok';
  try {
    await checkConnection();
  } catch {
    database = 'ko';
  }
  res.status(database === 'ok' ? 200 : 503).json({
    status: database === 'ok' ? 'ok' : 'degraded',
    uptime: process.uptime(),
    database,
  });
});

apiRouter.use('/users', usersRouter);
