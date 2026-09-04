const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();
const db = require("../../infra/db");

// Check that the email roughly matches the x@y.z format
function isValidEmail(email)
{
	return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Create a new account with a hashed password, after validating the input
router.post("/signup", async (req, res) =>
{
	const { email, password } = req.body;

	if (!isValidEmail(email))
		return res.status(400).json({ error: "Invalid email" });
	if (typeof password !== "string" || password.length < 8)
		return res.status(400).json({ error: "Password must be at least 8 characters" });

	const passwordHash = await bcrypt.hash(password, 10);
	const insertUser = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)");
	try
	{
		insertUser.run(email, passwordHash);
		res.status(201).json({ message: "Account created" });
	} catch (err) {
		console.log(err);
		res.status(409).json({ error: "Email already in use" });
	}
});

// Verify credentials and start a session for the user
router.post("/login", async (req, res) =>
{
	const { email, password } = req.body;

	if (!isValidEmail(email) || typeof password !== "string" || password.length === 0)
		return res.status(401).json({ error: "Invalid email or password" });

	const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
	if (!user)
		return res.status(401).json({ error: "Invalid email or password" });

	const passwordMatches = await bcrypt.compare(password, user.password_hash);
	if (!passwordMatches)
		return res.status(401).json({ error: "Invalid email or password" });

	req.session.userId = user.id;
	res.json({ message: "Logged in" });
});

// Return the currently logged-in user's info, or 401 if not logged in
router.get("/me", (req, res) =>
{
	if (!req.session.userId)
		return res.status(401).json({ error: "Not logged in" });

	const user = db.prepare("SELECT id, email FROM users WHERE id = ?").get(req.session.userId);
	res.json({ user });
});

module.exports = router;

