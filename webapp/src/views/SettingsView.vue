<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { get, post, startBadgeAction } from "../api.js";

const linked = ref(false);
const badgeStatus = ref("Chargement...");
const pairingStatus = ref("");
let pairingSocket = null;

// Fetch and display whether a badge is currently linked to this account
async function refreshBadgeStatus()
{
	const response = await get("/api/badge/status");
	if (!response.ok)
	{
		badgeStatus.value = response.data.error;
		return;
	}
	linked.value = response.data.linked;
	badgeStatus.value = linked.value ? "Badge lié à ce compte." : "Aucun badge lié.";
}

// Start badge pairing and show the live pairing status
async function startPairing()
{
	pairingSocket?.close();
	const start = await startBadgeAction("/api/pairing/start", (message) =>
	{
		if (message.status === "paired")
		{
			pairingStatus.value = "Badge lié !";
			refreshBadgeStatus();
		}
		else if (message.status === "already-linked")
			pairingStatus.value = "Ce badge est déjà lié à un compte.";
	});

	if (!start.ok)
	{
		pairingStatus.value = start.data.error;
		return;
	}
	pairingSocket = start.socket;
	pairingStatus.value = "Scanne ton badge dans les 30 secondes (code: " + start.data.code + ")";
}

// Unlink the currently linked badge from this account
async function unlink()
{
	const response = await post("/api/badge/unlink");
	if (!response.ok)
	{
		pairingStatus.value = response.data.error;
		return;
	}
	pairingStatus.value = "Badge délié.";
	refreshBadgeStatus();
}

onMounted(refreshBadgeStatus);
onUnmounted(() => pairingSocket?.close());
</script>

<template>
	<main class="relative z-10 flex-1 w-full max-w-lg mx-auto px-4 py-12">
		<section class="bulb-frame">
			<div class="rounded-2xl border-2 border-[#ff2d95] box-neon bg-[#0d0616] p-6 sm:p-8">
				<h1 class="font-neon text-3xl sm:text-5xl text-center glow-pink flicker">SETTINGS</h1>

				<section class="badge-panel mt-8" :class="{ linked }">
					<h2 class="font-bungee glow-cyan text-lg text-center">♣ BADGE NFC ♣</h2>

					<div class="vip-card mt-4 mx-auto w-full max-w-72" aria-hidden="true">
						<div class="flex items-start justify-between">
							<p class="font-bungee text-sm leading-tight">JACKPOT<br>CASINO</p>
							<p class="font-bungee text-xl leading-none">)))</p>
						</div>
						<div class="vip-chip mt-3"></div>
						<p class="absolute bottom-3 left-4 font-shade text-2xl">VIP PASS</p>
						<p class="absolute bottom-4 right-4 font-bungee text-xs">HIGH ROLLER</p>
					</div>

					<p class="badge-status mt-4 text-center font-bungee" role="status" aria-live="polite">{{ badgeStatus }}</p>

					<div class="mt-5 flex flex-col sm:flex-row gap-3">
						<button type="button" class="btn-casino btn-gold flex-1 py-3 font-bungee" @click="startPairing">LIER MON BADGE</button>
						<button v-if="linked" type="button" class="btn-casino btn-black flex-1 py-3 font-bungee" @click="unlink">DÉLIER</button>
					</div>
					<p v-if="pairingStatus" class="mt-4 rounded-lg border border-dashed border-[#00f0ff]/60 px-3 py-2 text-center text-sm glow-cyan" role="status" aria-live="polite">{{ pairingStatus }}</p>
				</section>

				<div class="bulbs mt-8" aria-hidden="true"></div>
				<RouterLink to="/home" class="btn-casino btn-cyan mt-6 py-3 font-bungee">← RETOUR À L'ACCUEIL</RouterLink>
			</div>
		</section>
	</main>
</template>
