// POST to an API route, return { ok, status, data } (status 0 if the server is unreachable)
export async function post(url, body)
{
	try
	{
		const options = { method: "POST" };
		if (body !== undefined)
		{
			options.headers = { "Content-Type": "application/json" };
			options.body = JSON.stringify(body);
		}
		const response = await fetch(url, options);
		const data = await response.json().catch(() => ({}));
		return { ok: response.ok, status: response.status, data };
	}
	catch
	{
		return { ok: false, status: 0, data: { error: "Serveur injoignable." } };
	}
}

// GET an API route, return { ok, status, data }
export async function get(url)
{
	try
	{
		const response = await fetch(url);
		const data = await response.json().catch(() => ({}));
		return { ok: response.ok, status: response.status, data };
	}
	catch
	{
		return { ok: false, status: 0, data: { error: "Serveur injoignable." } };
	}
}

// Open a WebSocket, start a badge action, and bind the socket to it with the returned code
export async function startBadgeAction(startUrl, onMessage)
{
	const wsProtocol = window.location.protocol === "https:" ? "wss://" : "ws://";
	const socket = new WebSocket(wsProtocol + window.location.host + "/ws");

	// Open the socket before starting the action, so there's no gap where a scan could arrive unheard
	await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));

	const response = await post(startUrl);
	if (!response.ok)
	{
		socket.close();
		return { socket: null, ...response };
	}

	socket.send(JSON.stringify({ code: response.data.code }));
	socket.addEventListener("message", (event) => onMessage(JSON.parse(event.data)));
	return { socket, ...response };
}
