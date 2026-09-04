const express = require("express");
const crypto = require("crypto");
const db = require("../../infra/db");
const router = express.Router();

const ACTION_TTL_MS = 30000;
const BADGE_LOGIN_START_COOLDOWN_MS = 10000;

let pendingAction = null;
const pendingLoginTokens = new Map();
const lastBadgeLoginStart = new Map();

// Atomically replace a user's linked badge with a new one (delete old, insert new)
const relinkBadge = db.transaction((uidHash, userId) =>
{
	db.prepare("DELETE FROM badges WHERE user_id = ?").run(userId);
	db.prepare("INSERT INTO badges (uid_hash, user_id) VALUES (?, ?)").run(uidHash, userId);
});

// Set a new pending badge action (with its own code and expiry) as the single global slot
function startAction(action)
{
	action.code = crypto.randomBytes(3).toString("hex");
	action.expiresAt = Date.now() + ACTION_TTL_MS;
	action.socket = null;

	pendingAction = action;
	setTimeout(() =>
	{
		if (pendingAction === action)
			pendingAction = null;
	}, ACTION_TTL_MS);

	return action;
}

// Start a 30s window during which the next scanned badge gets linked to the logged-in user
router.post("/pairing/start", (req, res) =>
{
	if (!req.session.userId)
		return res.status(401).json({ error: "Not logged in" });

	if (pendingAction && pendingAction.expiresAt > Date.now())
		return res.status(409).json({ error: "A badge action is already in progress" });

	const action = startAction({ mode: "pair", userId: req.session.userId });
	console.log("[badge] mode pair started for user", action.userId);

	res.json({ code: action.code });
});

// Start a 30s window during which the next scanned badge logs someone in
router.post("/badge-login/start", (req, res) =>
{
	const lastStart = lastBadgeLoginStart.get(req.ip);
	if (lastStart && Date.now() - lastStart < BADGE_LOGIN_START_COOLDOWN_MS)
		return res.status(429).json({ error: "Too many requests, try again shortly" });

	if (pendingAction && pendingAction.expiresAt > Date.now())
		return res.status(409).json({ error: "A badge action is already in progress" });

	lastBadgeLoginStart.set(req.ip, Date.now());

	const action = startAction({ mode: "login" });
	console.log("[badge] mode login started");

	res.json({ code: action.code });
});

// Exchange a one-time login token for a real session (regenerating the session id first)
router.post("/badge-login/confirm", (req, res) =>
{
	const { token } = req.body;
	const entry = pendingLoginTokens.get(token);

	if (!entry || entry.expiresAt <= Date.now())
		return res.status(401).json({ error: "Invalid or expired token" });

	pendingLoginTokens.delete(token);

	req.session.regenerate((err) =>
	{
		if (err)
			return res.status(500).json({ error: "Session error" });

		req.session.userId = entry.userId;
		req.session.save((err2) =>
		{
			if (err2)
				return res.status(500).json({ error: "Session error" });

			const user = db.prepare("SELECT email FROM users WHERE id = ?").get(entry.userId);
			console.log("[badge] connected", user.email);
			res.json({ message: "Logged in" });
		});
	});
});

// Report whether the logged-in user currently has a badge linked
router.get("/badge/status", (req, res) =>
{
	if (!req.session.userId)
		return res.status(401).json({ error: "Not logged in" });

	const badge = db.prepare("SELECT id FROM badges WHERE user_id = ?").get(req.session.userId);
	res.json({ linked: !!badge });
});

// Remove the logged-in user's badge link, freeing that badge for another account
router.post("/badge/unlink", (req, res) =>
{
	if (!req.session.userId)
		return res.status(401).json({ error: "Not logged in" });

	db.prepare("DELETE FROM badges WHERE user_id = ?").run(req.session.userId);
	res.json({ message: "Badge unlinked" });
});

// Attach a WebSocket to the pending action only once it proves it knows the action's code
function attachWebSocket(wss)
{
	wss.on("connection", (socket) =>
	{
		socket.once("message", (raw) =>
		{
			let code;
			try
			{
				code = JSON.parse(raw.toString()).code;
			}
			catch (err)
			{
				return socket.close();
			}

			if (pendingAction && !pendingAction.socket && pendingAction.code === code)
				pendingAction.socket = socket;
			else
				socket.close();
		});
	});
}

// Handle a badge scan from the ESP32: link it to a user (pairing) or log them in (login)
function handleScan(uid)
{
	if (!uid || typeof uid !== "string")
		return "invalid-uid";

	if (!pendingAction || pendingAction.expiresAt <= Date.now())
		return "not-pairing";

	const uidHash = crypto.createHash("sha256").update(uid).digest("hex");
	const action = pendingAction;
	let result;

	console.log("[badge] send uid", uid, "for", action.mode);

	if (action.mode === "pair")
	{
		result = "paired";
		try
		{
			relinkBadge(uidHash, action.userId);
		}
		catch (err)
		{
			result = "already-linked";
		}

		if (action.socket)
			action.socket.send(JSON.stringify({ status: result }));
	}
	else
	{
		const badge = db.prepare("SELECT user_id FROM badges WHERE uid_hash = ?").get(uidHash);

		if (!badge)
		{
			result = "unknown-badge";
			console.log("[badge] uid", uid, "not linked to any account");
			if (action.socket)
				action.socket.send(JSON.stringify({ status: result }));
		}
		else
		{
			result = "login-ready";
			const token = crypto.randomBytes(16).toString("hex");
			pendingLoginTokens.set(token, { userId: badge.user_id, expiresAt: Date.now() + 10000 });
			setTimeout(() => pendingLoginTokens.delete(token), 10000);

			if (action.socket)
				action.socket.send(JSON.stringify({ status: result, token }));
		}
	}

	pendingAction = null;
	return result;
}

module.exports = { router, attachWebSocket, handleScan };
