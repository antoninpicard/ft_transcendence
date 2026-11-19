// Validate the signup form, submit it, and redirect to login on success
document.getElementById("signup-form").addEventListener("submit", async (event) =>
{
	event.preventDefault();

	const email = document.getElementById("email").value;
	const password = document.getElementById("password").value;
	const errorEl = document.getElementById("error-message");

	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
	{
		errorEl.textContent = "Email invalide";
		return;
	}
	if (password.length < 8)
	{
		errorEl.textContent = "Le mot de passe doit faire au moins 8 caractères";
		return;
	}

	const response = await fetch("/api/signup",
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

	window.location.href = "/login.html";
});
