import * as apiKeysService from '../services/apiKeys.service.js';
import { AppError } from '../utils/AppError.js';

export async function list(req, res) {
  res.json({ items: await apiKeysService.listApiKeys(req.user.id) });
}

export async function create(req, res) {
  res.status(201).json(await apiKeysService.createApiKey(req.user.id, req.body.name));
}

export async function remove(req, res) {
  const revoked = await apiKeysService.revokeApiKey(req.user.id, req.params.id);
  if (!revoked) throw AppError.notFound('Clé introuvable');
  res.status(204).end();
}
