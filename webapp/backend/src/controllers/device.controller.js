import { env } from '../config/env.js';
import { hashBadgeUid } from '../services/badgeUid.js';

const SCAN_MESSAGES = {
  paired: 'Badge associé au compte',
  'already-linked': 'Badge déjà associé à un compte',
  'login-ready': 'Connexion par badge prête',
  'unknown-badge': 'Badge inconnu',
  'not-pairing': 'Aucune action badge en cours',
};

export function hello(_req, res) {
  res.json({ message: 'Bonjour' });
}

export async function scan(req, res) {
  const uidHash = hashBadgeUid(req.body.uid, env.BADGE_UID_SECRET);
  const status = await req.app.locals.badgeActions.handleScan(uidHash);
  res.json({ message: SCAN_MESSAGES[status] ?? SCAN_MESSAGES['not-pairing'] });
}
