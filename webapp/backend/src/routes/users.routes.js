import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { methodNotAllowed } from '../middlewares/methodNotAllowed.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requireSelf } from '../middlewares/requireSelf.js';
import { idParams, listQuery, userPatchBody } from '../schemas/users.schema.js';
import * as controller from '../controllers/users.controller.js';

export const usersRouter = Router();

usersRouter.get('/', validate({ query: listQuery }), controller.list);
usersRouter.get('/:id', validate({ params: idParams }), controller.getOne);
usersRouter.patch(
  '/:id',
  validate({ params: idParams, body: userPatchBody }),
  requireAuth,
  requireSelf,
  controller.update,
);
usersRouter.delete(
  '/:id',
  validate({ params: idParams }),
  requireAuth,
  requireSelf,
  controller.remove,
);

usersRouter.all('/', methodNotAllowed('GET'));
usersRouter.all('/:id', methodNotAllowed('GET', 'PATCH', 'DELETE'));
