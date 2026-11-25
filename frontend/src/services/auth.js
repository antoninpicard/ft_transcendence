import { apiRequest } from './api';

export async function login(email, password) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export async function signup(email, password) {
  return apiRequest('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export async function getCurrentUser() {
  const data = await apiRequest('/auth/me');
  return data.user;
}

export async function logout() {
  return apiRequest('/auth/logout', { method: 'POST' }).catch(() => null);
}
