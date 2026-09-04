const express = require("express");
const pairing = require("./pairing");
const router = express.Router();

// Reject requests that don't carry the ESP32's shared device token
function checkDeviceToken(req, res, next)
{
	if (req.headers["x-device-token"] !== process.env.DEVICE_TOKEN)
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
