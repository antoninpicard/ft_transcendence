import { env } from '../config/env.js';

const TIMEOUT_MS = 5000;

export function buildAuthorizeUrl(state) {
  const url = new URL('/oauth/authorize', env.FORTYTWO_API_URL);
  url.searchParams.set('client_id', env.FORTYTWO_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.FORTYTWO_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'public');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeCode(code) {
  const res = await fetch(new URL('/oauth/token', env.FORTYTWO_API_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.FORTYTWO_CLIENT_ID,
      client_secret: env.FORTYTWO_CLIENT_SECRET,
      code,
      redirect_uri: env.FORTYTWO_REDIRECT_URI,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Échange du code refusé par l'intra (${res.status})`);
  const body = await res.json();
  if (typeof body?.access_token !== 'string' || body.access_token === '') {
    throw new Error("Réponse de l'intra sans jeton d'accès");
  }
  return body.access_token;
}

export async function fetchProfile(accessToken) {
  const res = await fetch(new URL('/v2/me', env.FORTYTWO_API_URL), {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Lecture du profil refusée par l'intra (${res.status})`);
  const body = await res.json();
  return { id: body?.id, email: body?.email, login: body?.login };
}
