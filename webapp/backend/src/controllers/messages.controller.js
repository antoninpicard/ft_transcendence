import * as messagesService from '../services/messages.service.js';

export async function listConversations(req, res) {
  res.json({ items: await messagesService.listConversations(req.user.id) });
}

export async function getConversation(req, res) {
  const { after, before, limit } = req.validatedQuery;
  const items = await messagesService.getConversation(req.user.id, req.params.userId, {
    after,
    before,
    limit,
  });
  res.json({ items });
}

export async function send(req, res) {
  const message = await messagesService.sendMessage(
    req.user.id,
    req.params.userId,
    req.body.body,
  );
  res.status(201).json(message);
}
