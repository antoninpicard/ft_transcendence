import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { methodNotAllowed } from '../middlewares/methodNotAllowed.js';
import { idParams, listQuery, userBody, userPatchBody } from '../schemas/users.schema.js';
import * as controller from '../controllers/users.controller.js';

export const usersRouter = Router();

usersRouter.get('/', validate({ query: listQuery }), controller.list);
usersRouter.post('/', validate({ body: userBody }), controller.create);
usersRouter.get('/:id', validate({ params: idParams }), controller.getOne);
usersRouter.patch(
  '/:id',
  validate({ params: idParams, body: userPatchBody }),
  controller.update,
);
usersRouter.delete('/:id', validate({ params: idParams }), controller.remove);

usersRouter.all('/', methodNotAllowed('GET', 'POST'));
usersRouter.all('/:id', methodNotAllowed('GET', 'PATCH', 'DELETE'));
