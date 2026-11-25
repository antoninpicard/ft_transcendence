<script setup>
import JackpotCounter from "./JackpotCounter.vue";
import SlotMachine from "./SlotMachine.vue";
import WinnersFeed from "./WinnersFeed.vue";
</script>

<!-- Three-column casino layout (Vegas decor, card in the slot, live winners) used by login and signup -->
<template>
	<JackpotCounter />

	<main class="relative z-10 flex-1 w-full max-w-7xl mx-auto px-4 py-8 grid gap-8 lg:grid-cols-[1fr_minmax(0,30rem)_1fr] items-start">
		<aside class="hidden lg:flex flex-col items-center gap-8 pt-6" aria-hidden="true">
			<div class="font-neon text-6xl leading-tight text-center">
				<span class="glow-pink block">LAS</span>
				<span class="glow-cyan block flicker">VEGAS</span>
			</div>
			<SlotMachine />
			<div class="text-5xl flex gap-4">
				<span class="pulse-big">🎲</span>
				<span class="pulse-big [animation-delay:.3s]">🃏</span>
				<span class="pulse-big [animation-delay:.6s]">🎰</span>
			</div>
		</aside>

		<slot />

		<WinnersFeed />
	</main>
</template>
