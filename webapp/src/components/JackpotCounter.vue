<script setup>
import { ref, onMounted, onUnmounted } from "vue";

const jackpot = ref(12847392.45);
let timer = null;

// Keep the fake progressive jackpot going up while the component is on screen
onMounted(() =>
{
	timer = setInterval(() => jackpot.value += Math.random() * 97, 120);
});

onUnmounted(() => clearInterval(timer));
</script>

<template>
	<header class="relative z-10 text-center pt-6 px-4">
		<p class="font-bungee glow-cyan text-xs sm:text-sm tracking-[.15em] sm:tracking-[.4em]">★ MEGA PROGRESSIVE JACKPOT ★</p>
		<p class="font-shade text-2xl sm:text-5xl glow-yellow pulse-big mt-2" aria-hidden="true">
			{{ jackpot.toLocaleString("en-US", { style: "currency", currency: "USD" }) }}
		</p>
	</header>
</template>
