document.getElementById("signup-form").addEventListener("submit", async (event) =>
{
	event.preventDefault();

	const email = document.getElementById("email").value;
	const password = document.getElementById("password").value;

	const response = await fetch("/api/signup",
	{
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password })
	});

	const data = await response.json();

	if (!response.ok)
	{
		document.getElementById("error-message").textContent = data.error;
		return;
	}

	window.location.href = "/login.html";

	console.log("Connecté !", data);
});
