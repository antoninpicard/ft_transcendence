// Ambient casino decorations; each one only runs if its element is on the page

// Drop bills and coins from the top of the screen in a loop
function startMoneyRain()
{
	const layer = document.getElementById("money-layer");
	if (!layer)
		return;

	const icons = ["💵", "💰", "🪙", "💸", "💎"];
	for (let i = 0; i < 22; i++)
	{
		const money = document.createElement("span");
		money.className = "money";
		money.textContent = icons[i % icons.length];
		money.style.left = Math.random() * 100 + "vw";
		money.style.fontSize = 14 + Math.random() * 22 + "px";
		money.style.animationDuration = 6 + Math.random() * 8 + "s";
		money.style.animationDelay = -Math.random() * 14 + "s";
		layer.appendChild(money);
	}
}

// Keep the fake progressive jackpot counter going up
function startJackpotCounter()
{
	const counter = document.getElementById("jackpot");
	if (!counter)
		return;

	let jackpot = 12847392.45;
	setInterval(() =>
	{
		jackpot += Math.random() * 97;
		counter.textContent = jackpot.toLocaleString("en-US", { style: "currency", currency: "USD" });
	}, 120);
}

// Push a fake winner at the top of the live feed every 1 to 3 seconds
function startWinnersFeed()
{
	const feed = document.getElementById("feed");
	if (!feed)
		return;

	const names = ["xX_Kevin_Xx", "BigMike69", "LuckyLucie", "Norminette", "TonyMontana", "Grandma_Rose", "DoubleDown_Dan",
		"SlotQueen", "CryptoBro", "Jean-Mi_du_75", "HighRoller42", "Brenda_Vegas", "El_Patron", "Moulinette"];
	const games = ["MEGA CASH", "ROULETTE", "LUCKY 7", "DIAMOND RUSH", "GOLDEN TICKET", "BLACKJACK"];
	const pick = (list) => list[Math.floor(Math.random() * list.length)];

	function addWinner()
	{
		const big = Math.random() < 0.2;
		const amount = big ? 10000 + Math.random() * 490000 : 50 + Math.random() * 4950;

		const item = document.createElement("li");
		item.className = "feed-item px-4 py-3 flex items-center justify-between gap-3";

		const who = document.createElement("div");
		who.className = "min-w-0";
		who.innerHTML = '<p class="font-bold truncate"></p><p class="text-xs text-gray-400"></p>';
		who.children[0].textContent = (big ? "🚨 " : "") + pick(names);
		who.children[1].textContent = pick(games);

		const gain = document.createElement("p");
		gain.className = "font-bungee whitespace-nowrap " + (big ? "glow-yellow text-lg" : "glow-green");
		gain.textContent = "+$" + Math.round(amount).toLocaleString("en-US");

		item.append(who, gain);
		feed.prepend(item);
		while (feed.children.length > 14)
			feed.lastChild.remove();
	}

	for (let i = 0; i < 10; i++)
		addWinner();
	(function loop()
	{
		addWinner();
		setTimeout(loop, 900 + Math.random() * 1800);
	})();
}

// Spin the decorative slot machine every few seconds, sometimes landing a triple
function startSlotMachine()
{
	const reels = document.querySelectorAll(".reel");
	const message = document.getElementById("slot-msg");
	if (reels.length === 0 || !message)
		return;

	const symbols = ["🍒", "7️⃣", "💎", "🔔", "🍋", "⭐", "🍀"];
	setInterval(() =>
	{
		message.textContent = " ";
		reels.forEach((reel) => reel.classList.add("spin"));

		const final = [...reels].map(() => symbols[Math.floor(Math.random() * symbols.length)]);
		if (Math.random() < 0.25)
			final[1] = final[2] = final[0];

		reels.forEach((reel, i) => setTimeout(() =>
		{
			reel.classList.remove("spin");
			reel.textContent = final[i];
		}, 600 + i * 350));

		setTimeout(() =>
		{
			if (final[0] === final[1] && final[1] === final[2])
				message.textContent = "★ TRIPLE WIN ★";
		}, 1400);
	}, 3200);
}

startMoneyRain();
startJackpotCounter();
startWinnersFeed();
startSlotMachine();
