// Call an API route and return { ok, status, data, error }: error is the API's message, status 0 if the server is unreachable
export async function request(method, url, body)
{
	const options = { method };
	if (body !== undefined)
	{
		options.headers = { "Content-Type": "application/json" };
		options.body = JSON.stringify(body);
	}
	try
	{
		const response = await fetch(url, options);
		const data = await response.json().catch(() => ({}));
		const error = data.error ? data.error.message : "";
		return { ok: response.ok, status: response.status, data, error };
	}
	catch
	{
		return { ok: false, status: 0, data: {}, error: "Serveur injoignable." };
	}
}

// Open a WebSocket, start a badge action, and bind the socket to it with the returned code
export async function startBadgeAction(startUrl, onMessage)
{
	const wsProtocol = window.location.protocol === "https:" ? "wss://" : "ws://";
	const socket = new WebSocket(wsProtocol + window.location.host + "/ws");

	await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));

	const response = await request("POST", startUrl);
	if (!response.ok)
	{
		socket.close();
		return { socket: null, ...response };
	}

	socket.send(JSON.stringify({ code: response.data.code }));
	socket.addEventListener("message", (event) => onMessage(JSON.parse(event.data)));
	return { socket, ...response };
}
