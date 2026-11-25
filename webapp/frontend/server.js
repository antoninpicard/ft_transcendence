import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const API_URL = process.env.API_URL || "http://api:3000";
const DIST_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");

// Forward /api/... and the /ws WebSocket to the API, adding the X-Forwarded-* headers
function createApiProxy()
{
	return createProxyMiddleware({
		target: API_URL,
		pathFilter: ["/api/", "/ws"],
		ws: true,
		xfwd: true
	});
}

// Answer every page with index.html, so that Vue Router displays the right view (/login, /settings...)
function sendIndex(req, res)
{
	res.sendFile(path.join(DIST_DIR, "index.html"));
}

// Print where the site can be reached once the server listens
function logListening()
{
	console.log("Front served on http://" + HOST + ":" + PORT + ", API relayed to " + API_URL);
}

// Serve the built Vue front, relay the API calls and the WebSocket, then listen on PORT
function startServer()
{
	const app = express();
	const apiProxy = createApiProxy();

	app.disable("x-powered-by");
	app.use(apiProxy);
	app.use(express.static(DIST_DIR));
	app.get("/{*page}", sendIndex);

	const server = app.listen(PORT, HOST, logListening);
	server.on("upgrade", apiProxy.upgrade);
}

startServer();
