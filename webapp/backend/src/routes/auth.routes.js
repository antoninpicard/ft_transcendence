import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { methodNotAllowed } from '../middlewares/methodNotAllowed.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requireSession } from '../middlewares/requireSession.js';
import { registerBody, loginBody } from '../schemas/auth.schema.js';
import { codeBody } from '../schemas/twoFactor.schema.js';
import * as controller from '../controllers/auth.controller.js';
import * as oauth from '../controllers/oauth.controller.js';
import * as twoFactor from '../controllers/twoFactor.controller.js';

export const authRouter = Router();

authRouter.post('/register', validate({ body: registerBody }), controller.register);
authRouter.post('/login', validate({ body: loginBody }), controller.login);
authRouter.post('/logout', controller.logout);
authRouter.get('/me', requireAuth, controller.me);
authRouter.get('/session', controller.session);

authRouter.get('/42', oauth.start);
authRouter.get('/42/callback', oauth.callback);

authRouter.get('/2fa', requireAuth, requireSession, twoFactor.status);
authRouter.post('/2fa/setup', requireAuth, requireSession, twoFactor.setup);
authRouter.post('/2fa/enable', requireAuth, requireSession, validate({ body: codeBody }), twoFactor.enable);
authRouter.post('/2fa/disable', requireAuth, requireSession, validate({ body: codeBody }), twoFactor.disable);
authRouter.post('/2fa/verify', validate({ body: codeBody }), twoFactor.verify);

authRouter.all('/register', methodNotAllowed('POST'));
authRouter.all('/login', methodNotAllowed('POST'));
authRouter.all('/logout', methodNotAllowed('POST'));
authRouter.all('/me', methodNotAllowed('GET'));
authRouter.all('/session', methodNotAllowed('GET'));
authRouter.all('/42', methodNotAllowed('GET'));
authRouter.all('/42/callback', methodNotAllowed('GET'));
authRouter.all('/2fa', methodNotAllowed('GET'));
authRouter.all('/2fa/setup', methodNotAllowed('POST'));
authRouter.all('/2fa/enable', methodNotAllowed('POST'));
authRouter.all('/2fa/disable', methodNotAllowed('POST'));
authRouter.all('/2fa/verify', methodNotAllowed('POST'));
