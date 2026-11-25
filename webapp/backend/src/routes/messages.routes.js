import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { methodNotAllowed } from '../middlewares/methodNotAllowed.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { userIdParams } from '../schemas/friends.schema.js';
import { conversationQuery, messageBody } from '../schemas/messages.schema.js';
import * as controller from '../controllers/messages.controller.js';

export const messagesRouter = Router();

messagesRouter.get('/', requireAuth, controller.listConversations);
messagesRouter.all('/', methodNotAllowed('GET'));

messagesRouter.get(
  '/:userId',
  requireAuth,
  validate({ params: userIdParams, query: conversationQuery }),
  controller.getConversation,
);
messagesRouter.post(
  '/:userId',
  requireAuth,
  validate({ params: userIdParams, body: messageBody }),
  controller.send,
);
messagesRouter.all('/:userId', methodNotAllowed('GET', 'POST'));
