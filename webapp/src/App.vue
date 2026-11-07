<script setup>
import MoneyRain from "./components/MoneyRain.vue";

const MARQUEE = "★ WIN BIG ★ OPEN 24/7 ★ NO LIMIT ★ FREE DRINKS* ★ HIGH ROLLERS WELCOME ★ ALL IN ★ DOUBLE OR NOTHING ★ LUCKY 7 ★ JACKPOT TONIGHT ";
</script>

<template>
	<MoneyRain />

	<div class="relative z-10 bg-linear-to-r from-[#ff2d95] via-[#ffe600] to-[#ff2d95] text-black font-bungee text-sm py-1 marquee" aria-hidden="true">
		<div class="marquee-track">
			<span>{{ MARQUEE.repeat(2) }}</span>
			<span>{{ MARQUEE.repeat(2) }}</span>
		</div>
	</div>
	<div class="bulbs relative z-10" aria-hidden="true"></div>

	<RouterView />

	<div class="bulbs relative z-10" aria-hidden="true"></div>
	<footer class="relative z-10 py-4 text-center text-xs text-gray-400">
		<nav class="space-x-4">
			<RouterLink to="/privacy" class="hover:text-[#00f0ff] underline">Privacy Policy</RouterLink>
			<RouterLink to="/terms" class="hover:text-[#00f0ff] underline">Terms of Service</RouterLink>
		</nav>
		<p class="mt-2 text-[10px] text-gray-500">*Les boissons ne sont pas gratuites. Aucun argent réel. Joue responsable.</p>
	</footer>
</template>
