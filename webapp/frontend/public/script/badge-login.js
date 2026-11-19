// Start badge login, open a WebSocket, and confirm the login once a token arrives
document.getElementById("badge-login-button").addEventListener("click", async () =>
{
	const statusEl = document.getElementById("badge-login-status");

	const socket = new WebSocket("ws://" + window.location.host);

	// Open the socket before starting the action, so there's no gap where a scan could arrive unheard
	await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));

	const response = await fetch("/api/badge-login/start", { method: "POST" });
	const data = await response.json();

	if (!response.ok)
	{
		statusEl.textContent = data.error;
		socket.close();
		return;
	}

	// Prove to the server this socket belongs to the action we just started
	socket.send(JSON.stringify({ code: data.code }));
	statusEl.textContent = "Scanne ton badge dans les 30 secondes...";

	socket.addEventListener("message", async (event) =>
	{
		const message = JSON.parse(event.data);

		if (message.status === "login-ready")
		{
			const confirmResponse = await fetch("/api/badge-login/confirm",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token: message.token })
			});

			if (confirmResponse.ok)
				window.location.href = "/home.html";
			else
				statusEl.textContent = "Erreur de connexion";
		}
		else if (message.status === "unknown-badge")
			statusEl.textContent = "Ce badge n'est lié à aucun compte.";
	});
});
