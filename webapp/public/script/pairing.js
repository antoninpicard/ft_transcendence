document.getElementById("pair-button").addEventListener("click", async () =>
{
	const statusEl = document.getElementById("pairing-status");

	const response = await fetch("/api/pairing/start", { method: "POST" });
	const data = await response.json();

	if (!response.ok)
	{
		statusEl.textContent = data.error;
		return;
	}

	statusEl.textContent = "Scanne ton badge dans les 30 secondes (code: " + data.code + ")";

	const socket = new WebSocket("ws://" + window.location.host);

	socket.addEventListener("message", (event) =>
	{
		const message = JSON.parse(event.data);
		if (message.status === "paired")
			statusEl.textContent = "Badge lié !";
		else if (message.status === "already-linked")
			statusEl.textContent = "Ce badge est déjà lié à un compte.";
	});
});