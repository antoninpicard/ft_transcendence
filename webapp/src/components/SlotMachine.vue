<script setup>
import { ref, onMounted, onUnmounted } from "vue";

const SYMBOLS = ["🍒", "7️⃣", "💎", "🔔", "🍋", "⭐", "🍀"];

const reels = ref([
	{ symbol: "🍒", spinning: false },
	{ symbol: "7️⃣", spinning: false },
	{ symbol: "💎", spinning: false }
]);
const message = ref(" ");
let timers = [];
let loop = null;

// Spin the three reels, stop them one by one, sometimes landing a triple
function spin()
{
	message.value = " ";
	reels.value.forEach((reel) => reel.spinning = true);

	const final = reels.value.map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
	if (Math.random() < 0.25)
		final[1] = final[2] = final[0];

	timers = reels.value.map((reel, i) => setTimeout(() =>
	{
		reel.spinning = false;
		reel.symbol = final[i];
	}, 600 + i * 350));

	timers.push(setTimeout(() =>
	{
		if (final[0] === final[1] && final[1] === final[2])
			message.value = "★ TRIPLE WIN ★";
	}, 1400));
}

onMounted(() => loop = setInterval(spin, 3200));

onUnmounted(() =>
{
	clearInterval(loop);
	timers.forEach(clearTimeout);
});
</script>

<template>
	<div class="rounded-2xl border-4 border-[#d4af37] bg-linear-to-b from-[#3a0a4a] to-[#12021a] p-4 shadow-[0_0_30px_#d4af3788]">
		<p class="font-bungee text-center glow-yellow mb-3">HOT SLOTS</p>
		<div class="flex gap-2">
			<div v-for="(reel, i) in reels" :key="i" class="reel w-16 h-20 rounded-lg bg-white text-5xl flex items-center justify-center" :class="{ spin: reel.spinning }">{{ reel.symbol }}</div>
		</div>
		<p class="font-bungee text-center text-sm mt-3 glow-green">{{ message }}</p>
	</div>
</template>
