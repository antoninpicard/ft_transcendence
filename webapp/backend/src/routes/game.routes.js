import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { methodNotAllowed } from '../middlewares/methodNotAllowed.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requireSession } from '../middlewares/requireSession.js';
import { revealBody, ticketBody, ticketIdParams } from '../schemas/game.schema.js';
import * as controller from '../controllers/game.controller.js';

export const gameRouter = Router();

gameRouter.get('/catalog', requireAuth, controller.catalog);
gameRouter.all('/catalog', methodNotAllowed('GET'));

gameRouter.get('/leaderboard', requireAuth, controller.leaderboard);
gameRouter.all('/leaderboard', methodNotAllowed('GET'));

// Playing is session only: the game is played in the browser, not by API key scripts
gameRouter.post(
  '/tickets',
  requireAuth,
  requireSession,
  validate({ body: ticketBody }),
  controller.startTicket,
);
gameRouter.all('/tickets', methodNotAllowed('POST'));

gameRouter.post(
  '/tickets/:id/reveal',
  requireAuth,
  requireSession,
  validate({ params: ticketIdParams, body: revealBody }),
  controller.revealTicket,
);
gameRouter.all('/tickets/:id/reveal', methodNotAllowed('POST'));
