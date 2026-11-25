import * as twoFactor from "../services/twoFactor.service.js";
import { findPendingLogin, recordFailedAttempt, deletePendingLogin } from "../services/pendingLogins.js";
import { getPrivateUser } from "../services/users.service.js";
import { TWO_FACTOR_COOKIE, clearTwoFactorCookieOptions } from "../config/cookies.js";
import { AppError } from "../utils/AppError.js";
import { openSession } from "./openSession.js";

// GET /api/auth/2fa: tell the settings page whether 2FA is on
export async function status(req, res)
{
	res.json({ enabled: await twoFactor.isTwoFactorEnabled(req.user.id) });
}

// POST /api/auth/2fa/setup: create a secret and send what the QR code needs
export async function setup(req, res)
{
	res.json(await twoFactor.startSetup(req.user.id));
}

// POST /api/auth/2fa/enable: turn 2FA on once the first code from the app is right
export async function enable(req, res)
{
	await twoFactor.enable(req.user.id, req.body.code);
	res.status(204).end();
}

// POST /api/auth/2fa/disable: turn 2FA off, a valid code is required
export async function disable(req, res)
{
	await twoFactor.disable(req.user.id, req.body.code);
	res.status(204).end();
}

// POST /api/auth/2fa/verify: second login step, check the code of the pending login and open the real session
export async function verify(req, res)
{
	const token = req.cookies?.[TWO_FACTOR_COOKIE];
	const userId = findPendingLogin(token);
	if (userId === null)
		throw AppError.unauthorized("Connexion expirée, recommence depuis le début");
	const valid = await twoFactor.checkLoginCode(userId, req.body.code);
	if (!valid)
	{
		recordFailedAttempt(token);
		throw AppError.unauthorized("Code invalide");
	}
	deletePendingLogin(token);
	res.clearCookie(TWO_FACTOR_COOKIE, clearTwoFactorCookieOptions);
	await openSession(res, userId);
	res.json(await getPrivateUser(userId));
}
