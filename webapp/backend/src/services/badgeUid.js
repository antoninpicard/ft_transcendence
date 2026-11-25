import { createHmac } from 'node:crypto';

export function hashBadgeUid(uid, secret) {
  return createHmac('sha256', secret).update(uid.toUpperCase()).digest();
}
