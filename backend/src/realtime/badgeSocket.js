import { WebSocketServer } from 'ws';
import { ACTION_TTL_MS, PENDING_RESULT_TTL_MS } from '../services/badgeActions.js';

const HANDSHAKE_TIMEOUT_MS = 10_000;
const MAX_LIFETIME_MS = ACTION_TTL_MS + PENDING_RESULT_TTL_MS;

function parseCode(raw) {
  try {
    const message = JSON.parse(raw.toString());
    if (message && typeof message.code === 'string' && message.code.length > 0) {
      return message.code;
    }
  } catch {
    return null;
  }
  return null;
}

export function attachBadgeSocket(
  server,
  badgeActions,
  { handshakeTimeoutMs = HANDSHAKE_TIMEOUT_MS, maxLifetimeMs = MAX_LIFETIME_MS } = {},
) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });

  wss.on('connection', (socket) => {
    const handshakeTimer = setTimeout(() => socket.close(), handshakeTimeoutMs);
    const lifetimeTimer = setTimeout(() => socket.close(), maxLifetimeMs);
    handshakeTimer.unref();
    lifetimeTimer.unref();

    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(handshakeTimer);
      clearTimeout(lifetimeTimer);
    });

    socket.once('message', (raw) => {
      clearTimeout(handshakeTimer);
      const code = parseCode(raw);
      if (code === null) {
        socket.close();
        return;
      }
      badgeActions.attachSocket(code, socket);
    });
  });

  return wss;
}
