import * as friendsService from '../services/friends.service.js';

export async function list(req, res) {
  res.json({ items: await friendsService.listFriends(req.user.id) });
}

export async function listRequests(req, res) {
  res.json(await friendsService.listFriendRequests(req.user.id));
}

export async function sendRequest(req, res) {
  const result = await friendsService.sendFriendRequest(req.user.id, req.body.userId);
  res.status(result.status === 'pending' ? 201 : 200).json(result);
}

export async function acceptRequest(req, res) {
  res.json(await friendsService.acceptFriendRequest(req.user.id, req.params.userId));
}

export async function deleteRequest(req, res) {
  await friendsService.deleteFriendRequest(req.user.id, req.params.userId);
  res.status(204).end();
}

export async function removeFriend(req, res) {
  await friendsService.removeFriend(req.user.id, req.params.userId);
  res.status(204).end();
}
