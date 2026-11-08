// Validate the login form, submit it, and redirect to home on success
document.getElementById("login-form").addEventListener("submit", async (event) =>
{
	event.preventDefault();

	const email = document.getElementById("email").value;
	const password = document.getElementById("password").value;
	const errorEl = document.getElementById("error-message");

	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length === 0)
	{
		errorEl.textContent = "Invalid email or password";
		return;
	}

	const response = await fetch("/api/login",
	{
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password })
	});

	const data = await response.json();

	if (!response.ok)
	{
		errorEl.textContent = data.error;
		return;
	}

	window.location.href = "/home.html";
});
