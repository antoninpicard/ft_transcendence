import { randomBytes } from "node:crypto";

export const PENDING_LOGIN_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const pendingLogins = new Map();

// Drop the pending logins whose 5 minutes are over, so that the map does not grow forever
function removeExpired(nowMs)
{
	const entries = Array.from(pendingLogins.entries());
	let index = 0;
	while (index < entries.length)
	{
		const [token, pending] = entries[index];
		if (pending.expiresAt <= nowMs)
			pendingLogins.delete(token);
		index++;
	}
}

// Remember that a user passed the first factor (password, 42 or badge); return the random token that names this pending login
export function createPendingLogin(userId)
{
	const nowMs = Date.now();
	removeExpired(nowMs);
	const token = randomBytes(32).toString("hex");
	pendingLogins.set(token, { userId, expiresAt: nowMs + PENDING_LOGIN_TTL_MS, attempts: 0 });
	return token;
}

// Return the user of a pending login that is still valid, or null
export function findPendingLogin(token)
{
	const pending = pendingLogins.get(token);
	if (pending === undefined)
		return null;
	if (pending.expiresAt <= Date.now())
	{
		pendingLogins.delete(token);
		return null;
	}
	return pending.userId;
}

// Count a wrong code; after 5 wrong codes the pending login is dropped and the user has to start again
export function recordFailedAttempt(token)
{
	const pending = pendingLogins.get(token);
	if (pending === undefined)
		return;
	pending.attempts++;
	if (pending.attempts >= MAX_ATTEMPTS)
		pendingLogins.delete(token);
}

// Forget a pending login once the user is fully logged in
export function deletePendingLogin(token)
{
	pendingLogins.delete(token);
}
