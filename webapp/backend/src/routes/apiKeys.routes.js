import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { methodNotAllowed } from '../middlewares/methodNotAllowed.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requireSession } from '../middlewares/requireSession.js';
import { createKeyBody, keyIdParams } from '../schemas/apiKeys.schema.js';
import * as controller from '../controllers/apiKeys.controller.js';

export const apiKeysRouter = Router();

apiKeysRouter.get('/', requireAuth, requireSession, controller.list);
apiKeysRouter.post(
  '/',
  validate({ body: createKeyBody }),
  requireAuth,
  requireSession,
  controller.create,
);
apiKeysRouter.delete(
  '/:id',
  validate({ params: keyIdParams }),
  requireAuth,
  requireSession,
  controller.remove,
);

apiKeysRouter.all('/', methodNotAllowed('GET', 'POST'));
apiKeysRouter.all('/:id', methodNotAllowed('DELETE'));
