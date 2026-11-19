import { apiRequest, openPairingSocket } from './api';

export async function getBadgeStatus() {
  return apiRequest('/badge/status');
}

export async function unlinkBadge() {
  return apiRequest('/badge/unlink', { method: 'POST' });
}

export function startBadgeAction(endpoint, onMessage, onStatus) {
  const socket = openPairingSocket();

  socket.addEventListener('open', async () => {
    try {
      const data = await apiRequest(endpoint, { method: 'POST' });
      socket.send(JSON.stringify({ code: data.code }));
      onStatus?.('Scanne ton badge dans les 30 secondes…');
    } catch (error) {
      onStatus?.(error.message);
      socket.close();
    }
  }, { once: true });

  socket.addEventListener('message', (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      onStatus?.('Réponse du serveur invalide.');
    }
  });

  socket.addEventListener('error', () => onStatus?.('Connexion au serveur impossible.'));
  return socket;
}

export async function confirmBadgeLogin(token) {
  return apiRequest('/badge-login/confirm', {
    method: 'POST',
    body: JSON.stringify({ token })
  });
}
