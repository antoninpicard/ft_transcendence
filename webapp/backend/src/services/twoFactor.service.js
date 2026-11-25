import { queryOne } from "../db/pool.js";
import { AppError } from "../utils/AppError.js";
import { generateSecret, findValidStep, otpauthUrl } from "../utils/totp.js";

const INVALID_CODE = "Code invalide";

// Read the 2FA columns of a user; the last step comes back from PostgreSQL as a string, so it is turned into a number
async function readTwoFactor(userId)
{
	const row = await queryOne(
		`SELECT username, totp_secret AS "secret", totp_enabled AS "enabled", totp_last_step AS "lastStep"
		   FROM users WHERE id = $1`,
		[userId]
	);
	if (!row)
		throw AppError.notFound("Utilisateur introuvable");
	if (row.lastStep !== null)
		row.lastStep = Number(row.lastStep);
	return row;
}

// Save the step of an accepted code, only if it is newer than the last one: two requests with the same code cannot both pass
async function consumeStep(userId, step)
{
	const row = await queryOne(
		`UPDATE users SET totp_last_step = $2
		  WHERE id = $1 AND (totp_last_step IS NULL OR totp_last_step < $2)
		  RETURNING id`,
		[userId, step]
	);
	return row !== null;
}

// Check a code against the user's secret and burn it; true if it was valid and never used
async function acceptCode(userId, secret, lastStep, code)
{
	const step = findValidStep(secret, code, lastStep, Date.now());
	if (step === null)
		return false;
	return await consumeStep(userId, step);
}

// Tell whether the user has turned 2FA on
export async function isTwoFactorEnabled(userId)
{
	const row = await readTwoFactor(userId);
	return row.enabled;
}

// First activation step: create a new secret (not active yet) and return it with the link of the QR code
export async function startSetup(userId)
{
	const row = await readTwoFactor(userId);
	if (row.enabled)
		throw AppError.conflict("La double authentification est déjà activée");
	const secret = generateSecret();
	await queryOne(
		"UPDATE users SET totp_secret = $2, totp_last_step = NULL WHERE id = $1",
		[userId, secret]
	);
	return { secret, otpauthUrl: otpauthUrl(secret, row.username) };
}

// Second activation step: the first code from the app proves the secret was scanned, then 2FA is turned on
export async function enable(userId, code)
{
	const row = await readTwoFactor(userId);
	if (row.enabled)
		throw AppError.conflict("La double authentification est déjà activée");
	if (row.secret === null)
		throw AppError.badRequest("Commence par générer le QR code");
	if (!(await acceptCode(userId, row.secret, row.lastStep, code)))
		throw AppError.badRequest(INVALID_CODE);
	await queryOne("UPDATE users SET totp_enabled = true WHERE id = $1", [userId]);
}

// Turn 2FA off, which needs a valid code too, and forget the secret
export async function disable(userId, code)
{
	const row = await readTwoFactor(userId);
	if (!row.enabled)
		throw AppError.badRequest("La double authentification n'est pas activée");
	if (!(await acceptCode(userId, row.secret, row.lastStep, code)))
		throw AppError.badRequest(INVALID_CODE);
	await queryOne(
		"UPDATE users SET totp_secret = NULL, totp_enabled = false, totp_last_step = NULL WHERE id = $1",
		[userId]
	);
}

// Check the code typed at login for an account that has 2FA on
export async function checkLoginCode(userId, code)
{
	const row = await readTwoFactor(userId);
	if (!row.enabled)
		return false;
	return await acceptCode(userId, row.secret, row.lastStep, code);
}
