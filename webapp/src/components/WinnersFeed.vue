<script setup>
import { ref, onMounted, onUnmounted } from "vue";

const NAMES = ["xX_Kevin_Xx", "BigMike69", "LuckyLucie", "Norminette", "TonyMontana", "Grandma_Rose", "DoubleDown_Dan",
	"SlotQueen", "CryptoBro", "Jean-Mi_du_75", "HighRoller42", "Brenda_Vegas", "El_Patron", "Moulinette"];
const GAMES = ["MEGA CASH", "ROULETTE", "LUCKY 7", "DIAMOND RUSH", "GOLDEN TICKET", "BLACKJACK"];
const MAX_WINNERS = 14;

const winners = ref([]);
let nextId = 0;
let timer = null;

// Pick a random element of a list
function pick(list)
{
	return list[Math.floor(Math.random() * list.length)];
}

// Push a fake winner at the top of the feed and drop the oldest ones
function addWinner()
{
	const big = Math.random() < 0.2;
	const amount = big ? 10000 + Math.random() * 490000 : 50 + Math.random() * 4950;

	winners.value.unshift({
		id: nextId++,
		big,
		name: (big ? "🚨 " : "") + pick(NAMES),
		game: pick(GAMES),
		gain: "+$" + Math.round(amount).toLocaleString("en-US")
	});
	winners.value.splice(MAX_WINNERS);
}

// Add a new winner every 1 to 3 seconds
function loop()
{
	addWinner();
	timer = setTimeout(loop, 900 + Math.random() * 1800);
}

onMounted(() =>
{
	for (let i = 0; i < 10; i++)
		addWinner();
	loop();
});

onUnmounted(() => clearTimeout(timer));
</script>

<template>
	<aside class="rounded-2xl border-2 border-[#39ff14] bg-black/70 shadow-[0_0_25px_#39ff1466] overflow-hidden" aria-hidden="true">
		<div class="flex items-center justify-between px-4 py-3 border-b border-[#39ff14]/40">
			<p class="font-bungee glow-green">🔥 BIG WINNERS</p>
			<p class="text-xs font-bold text-red-400 flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>LIVE</p>
		</div>
		<ul class="h-72 lg:h-120 overflow-hidden divide-y divide-white/10">
			<li v-for="winner in winners" :key="winner.id" class="feed-item px-4 py-3 flex items-center justify-between gap-3">
				<div class="min-w-0">
					<p class="font-bold truncate">{{ winner.name }}</p>
					<p class="text-xs text-gray-400">{{ winner.game }}</p>
				</div>
				<p class="font-bungee whitespace-nowrap" :class="winner.big ? 'glow-yellow text-lg' : 'glow-green'">{{ winner.gain }}</p>
			</li>
		</ul>
	</aside>
</template>
