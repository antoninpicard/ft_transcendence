import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { methodNotAllowed } from '../middlewares/methodNotAllowed.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { friendRequestBody, userIdParams } from '../schemas/friends.schema.js';
import * as controller from '../controllers/friends.controller.js';

export const friendsRouter = Router();

friendsRouter.get('/', requireAuth, controller.list);
friendsRouter.get('/requests', requireAuth, controller.listRequests);
friendsRouter.post(
  '/requests',
  requireAuth,
  validate({ body: friendRequestBody }),
  controller.sendRequest,
);
friendsRouter.post(
  '/requests/:userId/accept',
  requireAuth,
  validate({ params: userIdParams }),
  controller.acceptRequest,
);
friendsRouter.delete(
  '/requests/:userId',
  requireAuth,
  validate({ params: userIdParams }),
  controller.deleteRequest,
);

friendsRouter.all('/', methodNotAllowed('GET'));
friendsRouter.all('/requests', methodNotAllowed('GET', 'POST'));
friendsRouter.all('/requests/:userId/accept', methodNotAllowed('POST'));
friendsRouter.all('/requests/:userId', methodNotAllowed('DELETE'));

friendsRouter.delete(
  '/:userId',
  requireAuth,
  validate({ params: userIdParams }),
  controller.removeFriend,
);
friendsRouter.all('/:userId', methodNotAllowed('DELETE'));
