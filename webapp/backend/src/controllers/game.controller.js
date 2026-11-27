import * as gameService from '../services/game.service.js';

export function catalog(_req, res) {
  res.json(gameService.getCatalog());
}

export async function leaderboard(req, res) {
  res.json(await gameService.getLeaderboard(req.user.id));
}

export async function startTicket(req, res) {
  res.status(201).json(await gameService.startTicket(req.user.id, req.body.ticket));
}

// The updated leaderboard comes with the prize, so the front redraws it without a second request
export async function revealTicket(req, res) {
  const prize = await gameService.revealTicket(req.user.id, req.params.id, req.body.keys);
  const board = await gameService.getLeaderboard(req.user.id);
  res.json({ ...prize, leaderboard: board });
}
