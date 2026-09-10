import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { methodNotAllowed } from '../middlewares/methodNotAllowed.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { registerBody, loginBody } from '../schemas/auth.schema.js';
import * as controller from '../controllers/auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', validate({ body: registerBody }), controller.register);
authRouter.post('/login', validate({ body: loginBody }), controller.login);
authRouter.post('/logout', controller.logout);
authRouter.get('/me', requireAuth, controller.me);

authRouter.all('/register', methodNotAllowed('POST'));
authRouter.all('/login', methodNotAllowed('POST'));
authRouter.all('/logout', methodNotAllowed('POST'));
authRouter.all('/me', methodNotAllowed('GET'));
