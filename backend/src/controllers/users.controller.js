import * as usersService from '../services/users.service.js';

export async function list(req, res) {
  const { limit, offset } = req.validatedQuery;
  res.json(await usersService.listUsers({ limit, offset }));
}

export async function getOne(req, res) {
  res.json(await usersService.getPublicUser(req.params.id));
}

export async function create(req, res) {
  const user = await usersService.createUser(req.body);
  res.status(201).location(`/api/users/${user.id}`).json(user);
}

export async function update(req, res) {
  res.json(await usersService.updateUser(req.params.id, req.body));
}

export async function remove(req, res) {
  await usersService.deleteUser(req.params.id);
  res.status(204).end();
}
