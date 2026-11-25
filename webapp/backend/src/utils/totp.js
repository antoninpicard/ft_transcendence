import { createHmac, randomBytes } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;
const SECRET_BYTES = 20;
const ISSUER = "CLB Private Club";

// Encode bytes in base32 (RFC 4648, without padding), the format authenticator apps expect for the secret
export function toBase32(bytes)
{
	let output = "";
	let value = 0;
	let bits = 0;
	let index = 0;
	while (index < bytes.length)
	{
		value = (value << 8) | bytes[index];
		bits += 8;
		while (bits >= 5)
		{
			output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
		index++;
	}
	if (bits > 0)
		output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
	return output;
}

// Decode a base32 text back into bytes (inverse of toBase32)
export function fromBase32(text)
{
	const bytes = [];
	let value = 0;
	let bits = 0;
	let index = 0;
	while (index < text.length)
	{
		value = (value << 5) | BASE32_ALPHABET.indexOf(text[index]);
		bits += 5;
		if (bits >= 8)
		{
			bytes.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
		index++;
	}
	return Buffer.from(bytes);
}

// Create a new random secret of 160 bits, written in base32
export function generateSecret()
{
	return toBase32(randomBytes(SECRET_BYTES));
}

// Number of the current 30-second time step since 1970 (the "T" of RFC 6238)
export function currentStep(nowMs)
{
	return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

// Compute the 6-digit code of a time step (RFC 6238): HMAC-SHA1 of the step, then dynamic truncation
export function codeAt(secret, step)
{
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(step));
	const hmac = createHmac("sha1", fromBase32(secret)).update(counter).digest();
	const offset = hmac[hmac.length - 1] & 15;
	const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
	return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

// Return the time step matching the code (one step of clock drift allowed each way), or null; a step already used is refused
export function findValidStep(secret, code, lastStep, nowMs)
{
	const current = currentStep(nowMs);
	let step = current - 1;
	while (step <= current + 1)
	{
		if (codeAt(secret, step) === code)
		{
			if (lastStep === null)
				return step;
			if (step > lastStep)
				return step;
		}
		step++;
	}
	return null;
}

// Build the otpauth:// link that the QR code contains, read by Google Authenticator, FreeOTP, etc.
export function otpauthUrl(secret, accountName)
{
	const label = encodeURIComponent(ISSUER + ":" + accountName);
	return "otpauth://totp/" + label + "?secret=" + secret + "&issuer=" + encodeURIComponent(ISSUER);
}
