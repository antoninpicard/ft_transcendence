<script setup>
import { ref } from "vue";

const POCKET_COUNT = 18;
const POCKET_ANGLE = 360 / POCKET_COUNT;
const SPIN_DURATION_MS = 4600;
const BULB_COUNT = 24;

const wheel = ref(null);
const wheelRotation = ref(0);
const ballRotation = ref(0);
const ballState = ref("");
let lostLastSpin = false;

// Blinking bulbs placed in a circle around the wheel
const bulbs = Array.from({ length: BULB_COUNT }, (_, i) =>
{
	const angle = (i / BULB_COUNT) * Math.PI * 2;
	return {
		left: `calc(${50 + Math.cos(angle) * 47.5}% - 5px)`,
		top: `calc(${50 + Math.sin(angle) * 47.5}% - 5px)`,
		animationDelay: (i % 2) * 0.2 + "s"
	};
});

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
function spin(chosenColor)
{
	const pocket = pickPocket(chosenColor);
	ballState.value = "";

	// Force a layout so the transition starts from the current angle
	void wheel.value.offsetWidth;

	// The ball stops at the top: turn the wheel so the center of the pocket ends up there
	const target = (360 - (pocket * POCKET_ANGLE + POCKET_ANGLE / 2)) % 360;
	const base = wheelRotation.value + 360 * 6;
	wheelRotation.value = base + ((target - (base % 360)) + 360) % 360;
	ballRotation.value -= 360 * 8;
	setTimeout(() => ballState.value = "dropped", 3200);

	return new Promise((resolve) => setTimeout(() =>
	{
		ballState.value = "dropped landed";
		const won = pocketColor(pocket) === chosenColor;
		lostLastSpin = !won;
		resolve(won);
	}, SPIN_DURATION_MS));
}

// Screen coordinates of the wheel center, used to aim the effects
function center()
{
	const rect = wheel.value.getBoundingClientRect();
	return [rect.left + rect.width / 2, rect.top + rect.height / 2];
}

defineExpose({ spin, center });
</script>

<template>
	<div class="wheel-wrap" aria-hidden="true">
		<div ref="wheel" class="wheel" :style="{ transform: `rotate(${wheelRotation}deg)` }"></div>
		<div class="ball-orbit" :style="{ transform: `rotate(${ballRotation}deg)` }">
			<span class="ball" :class="ballState"></span>
		</div>
		<span v-for="(bulb, i) in bulbs" :key="i" class="rim-bulb" :style="bulb"></span>
	</div>
</template>
