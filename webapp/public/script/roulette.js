const wheel = document.getElementById("wheel");
const ballOrbit = document.getElementById("ball-orbit");
const ball = document.getElementById("ball");

const POCKET_COUNT = 18;
const POCKET_ANGLE = 360 / POCKET_COUNT;
const SPIN_DURATION_MS = 4600;

let wheelRotation = 0;
let ballRotation = 0;
let lostLastSpin = false;

// Place the blinking bulbs around the wheel
function placeRimBulbs()
{
	const wrap = document.getElementById("wheel-wrap");
	for (let i = 0; i < 24; i++)
	{
		const bulb = document.createElement("span");
		const angle = (i / 24) * Math.PI * 2;
		bulb.className = "rim-bulb";
		bulb.style.left = `calc(${50 + Math.cos(angle) * 47.5}% - 5px)`;
		bulb.style.top = `calc(${50 + Math.sin(angle) * 47.5}% - 5px)`;
		bulb.style.animationDelay = (i % 2) * 0.2 + "s";
		wrap.appendChild(bulb);
	}
}

// Even pockets are red, odd pockets are black
function pocketColor(pocket)
{
	return pocket % 2 === 0 ? "red" : "black";
}

// Pick the pocket to land on; after a loss, force the player's color
function pickPocket(chosenColor)
{
	let pocket = Math.floor(Math.random() * POCKET_COUNT);
	if (lostLastSpin && pocketColor(pocket) !== chosenColor)
		pocket = (pocket + 1) % POCKET_COUNT;
	return pocket;
}

// Spin the wheel and the ball, resolve with true if the ball lands on chosenColor
function spinRoulette(chosenColor)
{
	const pocket = pickPocket(chosenColor);

	// Force a layout so the transition starts from the current angle
	ball.classList.remove("dropped", "landed");
	void wheel.offsetWidth;

	// The ball stops at the top: turn the wheel so the center of the pocket ends up there
	const target = (360 - (pocket * POCKET_ANGLE + POCKET_ANGLE / 2)) % 360;
	const base = wheelRotation + 360 * 6;
	wheelRotation = base + ((target - (base % 360)) + 360) % 360;
	ballRotation -= 360 * 8;

	wheel.style.transform = `rotate(${wheelRotation}deg)`;
	ballOrbit.style.transform = `rotate(${ballRotation}deg)`;
	setTimeout(() => ball.classList.add("dropped"), 3200);

	return new Promise((resolve) => setTimeout(() =>
	{
		ball.classList.add("landed");
		const won = pocketColor(pocket) === chosenColor;
		lostLastSpin = !won;
		resolve(won);
	}, SPIN_DURATION_MS));
}

// Screen coordinates of the wheel center, used to aim the effects
function wheelCenter()
{
	const rect = wheel.getBoundingClientRect();
	return [rect.left + rect.width / 2, rect.top + rect.height / 2];
}

placeRimBulbs();
