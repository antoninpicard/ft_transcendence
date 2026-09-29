// Restart a one-shot CSS animation class on an element
function replayAnimation(element, className)
{
	element.classList.remove(className);
	void element.offsetWidth;
	element.classList.add(className);
}

// Briefly bounce an element to draw attention to it
function nudge(element)
{
	replayAnimation(element, "nudge");
}

// Shake an element (used on failures)
function shake(element)
{
	replayAnimation(element, "shake");
}

// Flash the whole screen with a color
function flashScreen(color)
{
	const flash = document.createElement("div");
	flash.className = "flash";
	flash.style.background = color;
	document.body.appendChild(flash);
	setTimeout(() => flash.remove(), 800);
}

// Zoom a huge text across the screen, then remove it
function bigText(text, className)
{
	const overlay = document.createElement("div");
	const span = document.createElement("span");
	overlay.className = "big-text";
	overlay.setAttribute("aria-hidden", "true");
	span.className = className;
	span.textContent = text;
	overlay.appendChild(span);
	document.body.appendChild(overlay);
	setTimeout(() => overlay.remove(), 1900);
}

// Burst icons out of a point on the screen
function explode(x, y, icons, count)
{
	for (let i = 0; i < count; i++)
	{
		const particle = document.createElement("span");
		const angle = Math.random() * Math.PI * 2;
		const distance = Math.min(window.innerWidth, 900) * (0.2 + Math.random() * 0.4);

		particle.className = "particle";
		particle.setAttribute("aria-hidden", "true");
		particle.textContent = icons[Math.floor(Math.random() * icons.length)];
		particle.style.left = x + "px";
		particle.style.top = y + "px";
		particle.style.setProperty("--x", Math.cos(angle) * distance + "px");
		particle.style.setProperty("--y", Math.sin(angle) * distance + "px");
		particle.style.setProperty("--r", (Math.random() * 1080 - 540) + "deg");
		document.body.appendChild(particle);
		setTimeout(() => particle.remove(), 1700);
	}
}

// Winning celebration: gold flash, money explosion, fireworks and a giant JACKPOT
function celebrate(x, y)
{
	flashScreen("#ffe600");
	explode(x, y, ["💰", "💵", "🪙", "💎", "⭐", "🎰", "🤑"], 90);
	setTimeout(() => explode(window.innerWidth / 2, window.innerHeight / 3, ["🎆", "🎇", "✨", "💥"], 40), 300);
	bigText("JACKPOT!!!", "font-shade text-[clamp(2.5rem,13vw,6rem)] glow-yellow whitespace-nowrap");
}

// Losing effect: red flash, shaking card and a giant BUSTED
function busted(x, y, card)
{
	flashScreen("#ff0000");
	shake(card);
	explode(x, y, ["💸", "💀", "🧾"], 25);
	bigText("BUSTED 💀", "font-bungee text-[clamp(2.5rem,13vw,6rem)] glow-pink whitespace-nowrap");
}
