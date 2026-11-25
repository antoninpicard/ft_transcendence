import { isTwoFactorEnabled } from "../services/twoFactor.service.js";
import { createPendingLogin } from "../services/pendingLogins.js";
import { TWO_FACTOR_COOKIE, twoFactorCookieOptions } from "../config/cookies.js";
import { openSession } from "./openSession.js";

// End of the first login step (password, 42 or badge): open the session, or, if the account has 2FA, keep the login pending until the code is checked; return true when a code is needed
export async function openSessionOrAskCode(res, userId)
{
	const needsCode = await isTwoFactorEnabled(userId);
	if (!needsCode)
	{
		await openSession(res, userId);
		return false;
	}
	const token = createPendingLogin(userId);
	res.cookie(TWO_FACTOR_COOKIE, token, twoFactorCookieOptions);
	return true;
}
