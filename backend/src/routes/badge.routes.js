import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { methodNotAllowed } from '../middlewares/methodNotAllowed.js';
import { requireBadgeEnabled } from '../middlewares/requireBadgeEnabled.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { confirmBody } from '../schemas/badge.schema.js';
import * as controller from '../controllers/badge.controller.js';

export const badgeRouter = Router();

badgeRouter.post('/pairing', requireBadgeEnabled, requireAuth, controller.startPairing);
badgeRouter.post('/login', requireBadgeEnabled, controller.startLogin);
badgeRouter.post(
  '/login/confirm',
  requireBadgeEnabled,
  validate({ body: confirmBody }),
  controller.confirmLogin,
);
badgeRouter.get('/', requireBadgeEnabled, requireAuth, controller.status);
badgeRouter.delete('/', requireBadgeEnabled, requireAuth, controller.unlink);

badgeRouter.all('/pairing', methodNotAllowed('POST'));
badgeRouter.all('/login', methodNotAllowed('POST'));
badgeRouter.all('/login/confirm', methodNotAllowed('POST'));
badgeRouter.all('/', methodNotAllowed('GET', 'DELETE'));
