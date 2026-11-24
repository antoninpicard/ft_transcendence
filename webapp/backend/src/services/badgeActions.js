import { randomBytes } from 'node:crypto';
import { AppError } from '../utils/AppError.js';

export const ACTION_TTL_MS = 30_000;
export const LOGIN_TOKEN_TTL_MS = 10_000;
export const PENDING_RESULT_TTL_MS = 5_000;

export function createBadgeActions({ store, now = Date.now }) {
  let current = null;
  const pendingResults = new Map();
  const loginTokens = new Map();

  function closeQuietly(socket) {
    try {
      socket.close();
    } catch {
      return;
    }
  }

  function activeAction() {
    if (current && current.expiresAt <= now()) {
      if (current.socket) closeQuietly(current.socket);
      current = null;
    }
    return current;
  }

  function deliver(socket, result) {
    try {
      socket.send(JSON.stringify(result));
    } catch {
      return closeQuietly(socket);
    }
    closeQuietly(socket);
  }

  function purgeExpired() {
    const t = now();
    for (const [key, entry] of pendingResults) {
      if (entry.expiresAt <= t) pendingResults.delete(key);
    }
    for (const [key, entry] of loginTokens) {
      if (entry.expiresAt <= t) loginTokens.delete(key);
    }
  }

  function start(mode, userId) {
    purgeExpired();
    if (mode === 'pair' && !userId) {
      throw new TypeError('Un appairage exige un compte');
    }

    const existing = activeAction();
    if (existing) {
      if (mode === 'pair' && existing.mode === 'login') {
        if (existing.socket) closeQuietly(existing.socket);
        current = null;
      } else {
        throw AppError.conflict('Une action badge est déjà en cours');
      }
    }

    const code = randomBytes(16).toString('hex');
    current = {
      mode,
      userId: mode === 'pair' ? userId : null,
      code,
      socket: null,
      expiresAt: now() + ACTION_TTL_MS,
    };
    return { code };
  }

  function issueLoginToken(userId) {
    const token = randomBytes(32).toString('base64url');
    loginTokens.set(token, { userId, expiresAt: now() + LOGIN_TOKEN_TTL_MS });
    return token;
  }

  function publish(action, result) {
    if (action.socket) {
      deliver(action.socket, result);
    } else {
      pendingResults.set(action.code, {
        result,
        expiresAt: now() + PENDING_RESULT_TTL_MS,
      });
    }
  }

  async function handleScan(uidHash) {
    const action = activeAction();
    if (!action) return 'not-pairing';
    current = null;

    let status;
    let token;
    try {
      if (action.mode === 'pair') {
        status = await store.linkBadge(action.userId, uidHash);
        if (status === 'user-gone') status = 'not-pairing';
      } else {
        const userId = await store.findUserIdByUidHash(uidHash);
        if (userId) {
          status = 'login-ready';
          token = issueLoginToken(userId);
        } else {
          status = 'unknown-badge';
        }
      }
    } catch (err) {
      if (action.socket) closeQuietly(action.socket);
      throw err;
    }

    publish(action, token ? { status, token } : { status });
    return status;
  }

  function attachSocket(code, socket) {
    const pending = pendingResults.get(code);
    if (pending) {
      pendingResults.delete(code);
      if (pending.expiresAt > now()) {
        deliver(socket, pending.result);
        return;
      }
      closeQuietly(socket);
      return;
    }

    const action = activeAction();
    if (action && action.code === code && !action.socket) {
      action.socket = socket;
      return;
    }
    closeQuietly(socket);
  }

  function detachSocket(socket) {
    if (current && current.socket === socket) current.socket = null;
  }

  function consumeLoginToken(token) {
    const entry = loginTokens.get(token);
    if (!entry) return null;
    loginTokens.delete(token);
    return entry.expiresAt > now() ? entry.userId : null;
  }

  return { start, handleScan, attachSocket, detachSocket, consumeLoginToken };
}
