const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const router = express.Router();
const db = require("../../infra/db");

const FORTYTWO_CLIENT_ID = process.env.FORTYTWO_CLIENT_ID;
const FORTYTWO_CLIENT_SECRET = process.env.FORTYTWO_CLIENT_SECRET;
const FORTYTWO_REDIRECT_URI = process.env.FORTYTWO_REDIRECT_URI;

// Redirect the browser to 42's login page, with a random state value stored in the
// session so the callback below can verify the redirect really came from a request we made
router.get("/auth/42", (req, res) =>
{
	const state = crypto.randomBytes(16).toString("hex");
	req.session.oauthState = state;

	const params = new URLSearchParams({
		client_id: FORTYTWO_CLIENT_ID,
		redirect_uri: FORTYTWO_REDIRECT_URI,
		response_type: "code",
		scope: "public",
		state
	});

	req.session.save(() => res.redirect("https://api.intra.42.fr/oauth/authorize?" + params.toString()));
});

// 42 redirects the browser back here with a temporary code: exchange it server-side
// for an access token, use that token to fetch the user's 42 profile, then log them in
router.get("/auth/42/callback", async (req, res) =>
{
	const { code, state } = req.query;

	if (!state || state !== req.session.oauthState)
		return res.status(403).send("Invalid OAuth state");
	delete req.session.oauthState;

	if (typeof code !== "string")
		return res.status(400).send("Missing authorization code");

	try
	{
		const tokenResponse = await fetch("https://api.intra.42.fr/oauth/token",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				grant_type: "authorization_code",
				client_id: FORTYTWO_CLIENT_ID,
				client_secret: FORTYTWO_CLIENT_SECRET,
				code,
				redirect_uri: FORTYTWO_REDIRECT_URI
			})
		});

		if (!tokenResponse.ok)
			return res.status(502).send("Failed to exchange code with 42");

		const { access_token } = await tokenResponse.json();

		const meResponse = await fetch("https://api.intra.42.fr/v2/me",
		{
			headers: { Authorization: "Bearer " + access_token }
		});

		if (!meResponse.ok)
			return res.status(502).send("Failed to fetch 42 profile");

		const me = await meResponse.json();
		const userId = await findOrCreateUser(me.id, me.email);

		req.session.regenerate((err) =>
		{
			if (err)
				return res.status(500).send("Session error");

			req.session.userId = userId;
			req.session.save((err2) =>
			{
				if (err2)
					return res.status(500).send("Session error");
				res.redirect("/home.html");
			});
		});
	}
	catch (err)
	{
		console.log(err);
		res.status(502).send("OAuth error");
	}
});

// Find the local account matching this 42 id, link it to an existing account with the
// same email, or create a new OAuth-only account (no password login possible)
async function findOrCreateUser(fortytwoId, email)
{
	let user = db.prepare("SELECT id FROM users WHERE fortytwo_id = ?").get(fortytwoId);
	if (user)
		return user.id;

	user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
	if (user)
	{
		db.prepare("UPDATE users SET fortytwo_id = ? WHERE id = ?").run(fortytwoId, user.id);
		return user.id;
	}

	// Password login is disabled for this account by giving it a hash of an unguessable
	// random value nobody, including the account owner, ever knows
	const unusablePassword = crypto.randomBytes(32).toString("hex");
	const passwordHash = await bcrypt.hash(unusablePassword, 10);
	const insert = db.prepare("INSERT INTO users (email, password_hash, fortytwo_id) VALUES (?, ?, ?)");
	const info = insert.run(email, passwordHash, fortytwoId);
	return info.lastInsertRowid;
}

module.exports = router;
