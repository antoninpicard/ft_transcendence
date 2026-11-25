import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

const BAUD_RATE = 115200;
const UID_PREFIX = "UID read: ";
const UID_PATTERN = /^[0-9A-F]{8,20}$/;

// Read a required setting from the environment, or stop the program with a clear message
function requireEnv(name)
{
	const value = process.env[name];
	if (!value)
	{
		console.error("Missing " + name + ": copy .env.example to .env and fill it in");
		process.exit(1);
	}
	return value;
}

const SERIAL_PORT = requireEnv("SERIAL_PORT");
const API_URL = requireEnv("API_URL");
const DEVICE_TOKEN = requireEnv("DEVICE_TOKEN");

// Send one scanned UID to the API, authenticated with the device token, and print what the API answered
async function sendScan(uid)
{
	try
	{
		const response = await fetch(API_URL + "/api/scan", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-Device-Token": DEVICE_TOKEN },
			body: JSON.stringify({ uid })
		});
		const data = await response.json().catch(() => ({}));
		const answer = data.message || (data.error ? data.error.message : "");
		console.log("Scan sent: " + response.status + " " + answer);
	}
	catch (error)
	{
		console.error("API unreachable: " + error.message);
	}
}

// Handle one line printed by the ESP32: only "UID read: XXXX" lines with a well-formed UID are sent
function handleLine(line)
{
	const text = line.trim();
	if (!text.startsWith(UID_PREFIX))
		return;
	const uid = text.slice(UID_PREFIX.length).toUpperCase();
	if (!UID_PATTERN.test(uid))
	{
		console.error("Ignored malformed UID");
		return;
	}
	console.log("Badge scanned");
	sendScan(uid);
}

// Report a serial port problem (unplugged reader, wrong port name...) and stop
function handleSerialError(error)
{
	console.error("Serial port error: " + error.message);
	process.exit(1);
}

// Say hello to the API with the device token, and stop if the address or the token is wrong
async function checkApi()
{
	try
	{
		const response = await fetch(API_URL + "/api/hello", {
			method: "POST",
			headers: { "X-Device-Token": DEVICE_TOKEN }
		});
		if (!response.ok)
		{
			console.error("API refused the bridge (" + response.status + "): check API_URL and DEVICE_TOKEN");
			process.exit(1);
		}
	}
	catch (error)
	{
		console.error("API unreachable at " + API_URL + ": " + error.message);
		process.exit(1);
	}
}

// Check the API, then open the serial port of the ESP32 and forward every scanned badge to the API
async function startBridge()
{
	await checkApi();
	const port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE });
	const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));
	port.on("error", handleSerialError);
	parser.on("data", handleLine);
	console.log("Listening to the badge reader on " + SERIAL_PORT + ", sending scans to " + API_URL);
}

startBridge();
