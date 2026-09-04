const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();
const db = require("../../infra/db");

router.post("/signup", async (req, res) => 
{
	const { email, password } = req.body;
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

router.post("/login", async (req, res) => 
{
	const { email, password } = req.body;
	const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
	if (!user)
		return res.status(401).json({ error: "Invalid email or password" });

	const passwordMatches = await bcrypt.compare(password, user.password_hash);
	if (!passwordMatches)
		return res.status(401).json({ error: "Invalid email or password" });

	req.session.userId = user.id;
	res.json({ message: "Logged in" });
});

router.get("/me", (req, res) =>
{
	if (!req.session.userId)
		return res.status(401).json({ error: "Not logged in" });

	const user = db.prepare("SELECT id, email FROM users WHERE id = ?").get(req.session.userId);
	res.json({ user });
});

module.exports = router;

