<script setup>
const ICONS = ["💵", "💰", "🪙", "💸", "💎"];

// Bills and coins falling from the top of the screen, each with a random position and speed
const bills = Array.from({ length: 22 }, (_, i) => ({
	icon: ICONS[i % ICONS.length],
	style: {
		left: Math.random() * 100 + "vw",
		fontSize: 14 + Math.random() * 22 + "px",
		animationDuration: 6 + Math.random() * 8 + "s",
		animationDelay: -Math.random() * 14 + "s"
	}
}));
</script>

<template>
	<div aria-hidden="true">
		<span v-for="(bill, i) in bills" :key="i" class="money" :style="bill.style">{{ bill.icon }}</span>
	</div>
</template>
