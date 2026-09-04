const express = require("express");
const crypto = require("crypto");
const pairing = require("./pairing");
const router = express.Router();

if (!process.env.DEVICE_TOKEN)
	throw new Error("DEVICE_TOKEN must be set in the environment");

// Reject requests that don't carry the ESP32's shared device token
function checkDeviceToken(req, res, next)
{
	const header = req.headers["x-device-token"];
	const expected = process.env.DEVICE_TOKEN;

	if (typeof header !== "string" || header.length !== expected.length)
		return res.status(401).json({ error: "Invalid device token" });

	if (!crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected)))
		return res.status(401).json({ error: "Invalid device token" });

	next();
}

// Simple handshake endpoint so the ESP32 can confirm it reached the server
router.post("/hello", checkDeviceToken, (req, res) =>
{
	console.log("Device online:", req.body);
	res.json({ message: "Hello acknowledged" });
});

// Forward a scanned badge UID to the pairing logic and report the result
router.post("/scan", checkDeviceToken, (req, res) =>
{
	const uid = req.body.uid;

	const result = pairing.handleScan(uid);
	const messages =
	{
		"paired": "Badge linked",
		"already-linked": "Badge already linked to an account",
		"not-pairing": "Scan received",
		"login-ready": "Login token generated",
		"unknown-badge": "Badge not recognized",
		"invalid-uid": "Invalid UID"
	};

	res.json({ message: messages[result] });
});

module.exports = router;
