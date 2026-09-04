const express = require("express");
const crypto = require("crypto");
const db = require("../../infra/db");
const router = express.Router();

let pendingAction = null;
const pendingLoginTokens = new Map();

router.post("/pairing/start", (req, res) =>
{
	if (!req.session.userId)
		return res.status(401).json({ error: "Not logged in" });

	if (pendingAction && pendingAction.expiresAt > Date.now())
		return res.status(409).json({ error: "A badge action is already in progress" });

	const code = crypto.randomBytes(3).toString("hex");
	const action =
	{
		mode: "pair",
		userId: req.session.userId,
		code,
		expiresAt: Date.now() + 30000,
		socket: null
	};

	pendingAction = action;
	setTimeout(() =>
	{
		if (pendingAction === action)
			pendingAction = null;
	}, 30000);

	res.json({ code });
});

router.post("/badge-login/start", (req, res) =>
{
	if (pendingAction && pendingAction.expiresAt > Date.now())
		return res.status(409).json({ error: "A badge action is already in progress" });

	const action =
	{
		mode: "login",
		expiresAt: Date.now() + 30000,
		socket: null
	};

	pendingAction = action;
	setTimeout(() =>
	{
		if (pendingAction === action)
			pendingAction = null;
	}, 30000);

	res.json({ ok: true });
});

router.post("/badge-login/confirm", (req, res) =>
{
	const { token } = req.body;
	const entry = pendingLoginTokens.get(token);

	if (!entry || entry.expiresAt <= Date.now())
		return res.status(401).json({ error: "Invalid or expired token" });

	pendingLoginTokens.delete(token);
	req.session.userId = entry.userId;
	res.json({ message: "Logged in" });
});

function attachWebSocket(wss)
{
	wss.on("connection", (socket) =>
	{
		if (pendingAction && !pendingAction.socket)
			pendingAction.socket = socket;
	});
}

function handleScan(uid)
{
	if (!uid || typeof uid !== "string")
		return "invalid-uid";

	if (!pendingAction || pendingAction.expiresAt <= Date.now())
		return "not-pairing";

	const uidHash = crypto.createHash("sha256").update(uid).digest("hex");
	const action = pendingAction;
	let result;

	if (action.mode === "pair")
	{
		result = "paired";
		try
		{
			db.prepare("INSERT INTO badges (uid_hash, user_id) VALUES (?, ?)").run(uidHash, action.userId);
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
