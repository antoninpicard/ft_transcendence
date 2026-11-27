// Checks every theme of src/themes.css against the WCAG 2.2 AA contrast guidelines:
//   - 1.4.3  text: 4.5:1 (3:1 for large text: 24px, or 18.66px bold)
//   - 1.4.11 non-text: 3:1 for what identifies a control or its state (borders, focus, selection)
// Run it with `npm run check:contrast` after changing a color or adding a theme: it exits
// with 1 and lists the failing pairs. Every pair below is one the CSS really draws: keep the
// list in sync when a rule starts using a token on a new background.
import { readFileSync } from "node:fs";

const TEXT = 4.5;
const LARGE_TEXT = 3;
const NON_TEXT = 3;

// [foreground token, background tokens it is drawn on, minimum ratio, where]
// "surface" is translucent: it is mixed over "bg", like in the page.
const PAIRS = [
	// Text
	["text", ["bg", "surface", "surface-solid", "surface-soft", "surface-warm", "surface-highlight", "gradient-from", "gradient-to", "hero-to"], TEXT, "body text, titles, inputs, ticket links, current player row"],
	["text-soft", ["surface", "surface-soft", "surface-warm", "surface-highlight", "gradient-from", "hero-to"], TEXT, "labels, paragraphs, form messages, scores, ticket details"],
	["text-muted", ["bg", "surface"], TEXT, "game note under the board, ticket level names"],
	["accent-strong", ["bg", "surface", "surface-highlight"], TEXT, "links (header, footer), h2, kicker, leaderboard ranks"],
	["on-accent", ["accent", "accent-hover"], TEXT, "main buttons and action links, also when hovered"],
	["on-secondary", ["secondary", "secondary-hover"], TEXT, "secondary buttons, also when hovered"],
	["danger", ["surface", "surface-soft", "gradient-from", "gradient-to"], TEXT, "error messages (panels, form messages, game)"],
	["success-text", ["success-bg", "gradient-from", "gradient-to"], TEXT, "status list, done keys, game progress"],
	["key-text", ["key-bg", "key-next-bg"], TEXT, "letters of the key sequence"],
	["prize-text", ["prize-bg"], TEXT, "revealed prize (its POINTS label is small)"],
	// Non-text: controls and their states
	["input-border", ["surface-solid", "surface"], NON_TEXT, "border of the text fields"],
	["accent-strong", ["surface-solid", "surface", "surface-warm"], NON_TEXT, "focused field, selected theme and selected ticket borders, focus outline"],
	["key-next-border", ["key-bg", "surface-warm"], NON_TEXT, "border of the next key to type"],
	["success-border", ["key-bg", "surface-warm"], NON_TEXT, "border of the keys already typed"]
];

const CSS_PATH = new URL("../src/themes.css", import.meta.url);

function parseThemes(css)
{
	const themes = {};
	for (const [, name, body] of css.matchAll(/\[data-theme="([\w-]+)"\]\s*\{([^}]*)\}/g))
		themes[name] = Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k.slice(2), v.trim()]));
	return themes;
}

// "#rrggbb" or "rgba(r, g, b, a)" -> { rgb: [0-1, 0-1, 0-1], alpha }
function parseColor(value)
{
	let match = value.match(/^#([0-9a-f]{6})$/i);
	if (match)
		return { rgb: [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16) / 255), alpha: 1 };
	match = value.match(/^rgba\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)$/);
	if (match)
		return { rgb: [1, 2, 3].map((i) => Number(match[i]) / 255), alpha: Number(match[4]) };
	throw new Error("Unsupported color: " + value);
}

const mix = (top, under) => top.rgb.map((c, i) => top.alpha * c + (1 - top.alpha) * under[i]);

function luminance(rgb)
{
	const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b)
{
	const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (high + 0.05) / (low + 0.05);
}

function resolve(theme, token)
{
	if (!(token in theme))
		throw new Error("Missing token --" + token);
	const color = parseColor(theme[token]);
	return color.alpha === 1 ? color.rgb : mix(color, parseColor(theme.bg).rgb);
}

const themes = parseThemes(readFileSync(CSS_PATH, "utf8"));
let failures = 0;

for (const [name, theme] of Object.entries(themes))
{
	const lines = [];
	for (const [fg, backgrounds, min, where] of PAIRS)
	{
		for (const bg of backgrounds)
		{
			const value = ratio(resolve(theme, fg), resolve(theme, bg));
			if (value < min)
			{
				failures += 1;
				lines.push(`  ✖ --${fg} on --${bg}: ${value.toFixed(2)} < ${min} (${where})`);
			}
		}
	}
	console.log((lines.length ? "✖ " : "✔ ") + name + (lines.length ? "" : ": every pair passes"));
	for (const line of lines)
		console.log(line);
}

if (failures)
{
	console.log(`\n${failures} pair(s) below the WCAG 2.2 AA contrast guidelines`);
	process.exit(1);
}
