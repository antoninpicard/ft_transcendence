import { AppError } from '../utils/AppError.js';
import * as badges from '../services/badges.service.js';
import { getPrivateUser } from '../services/users.service.js';
import { openSession } from './openSession.js';

export function startPairing(req, res) {
  res.json(req.app.locals.badgeActions.start('pair', req.user.id));
}

export function startLogin(req, res) {
  res.json(req.app.locals.badgeActions.start('login'));
}

export async function confirmLogin(req, res) {
  const userId = req.app.locals.badgeActions.consumeLoginToken(req.body.token);
  if (userId === null || userId === undefined) {
    throw AppError.unauthorized('Jeton de connexion par badge invalide');
  }
  await openSession(res, userId);
  res.json(await getPrivateUser(userId));
}

export async function status(req, res) {
  res.json({ linked: await badges.hasBadge(req.user.id) });
}

export async function unlink(req, res) {
  await badges.unlinkBadge(req.user.id);
  res.status(204).end();
}
