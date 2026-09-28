const statusEl = document.getElementById("badge-status");
const pairButton = document.getElementById("pair-button");
const unlinkButton = document.getElementById("unlink-button");
const pairingStatusEl = document.getElementById("pairing-status");

// Fetch and display whether a badge is currently linked to this account
async function refreshBadgeStatus()
{
	const response = await fetch("/api/badge/status");
	const data = await response.json();

	if (!response.ok)
	{
		statusEl.textContent = data.error;
		return;
	}

	statusEl.textContent = data.linked ? "Badge lié à ce compte." : "Aucun badge lié.";
	unlinkButton.style.display = data.linked ? "inline" : "none";
}

refreshBadgeStatus();

// Start badge pairing, open a WebSocket, and show the live pairing status
pairButton.addEventListener("click", async () =>
{
	const wsProtocol = window.location.protocol === "https:" ? "wss://" : "ws://";
	const socket = new WebSocket(wsProtocol + window.location.host);

	// Open the socket before starting the action, so there's no gap where a scan could arrive unheard
	await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));

	const response = await fetch("/api/pairing/start", { method: "POST" });
	const data = await response.json();

	if (!response.ok)
	{
		pairingStatusEl.textContent = data.error;
		socket.close();
		return;
	}

	// Prove to the server this socket belongs to the action we just started
	socket.send(JSON.stringify({ code: data.code }));
	pairingStatusEl.textContent = "Scanne ton badge dans les 30 secondes (code: " + data.code + ")";

	socket.addEventListener("message", (event) =>
	{
		const message = JSON.parse(event.data);

		if (message.status === "paired")
		{
			pairingStatusEl.textContent = "Badge lié !";
			refreshBadgeStatus();
		}
		else if (message.status === "already-linked")
			pairingStatusEl.textContent = "Ce badge est déjà lié à un compte.";
	});
});

// Unlink the currently linked badge from this account
unlinkButton.addEventListener("click", async () =>
{
	const response = await fetch("/api/badge/unlink", { method: "POST" });
	const data = await response.json();

	if (!response.ok)
	{
		pairingStatusEl.textContent = data.error;
		return;
	}

	pairingStatusEl.textContent = "Badge délié.";
	refreshBadgeStatus();
});
