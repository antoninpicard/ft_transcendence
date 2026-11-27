<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { request, startBadgeAction } from "../api.js";
import TwoFactorSettings from "../components/TwoFactorSettings.vue";

const linked = ref(false);
const badgeStatus = ref("Chargement...");
const pairingStatus = ref("");
let pairingSocket = null;

// Fetch and display whether a badge is currently linked to this account
async function refreshBadgeStatus()
{
	const response = await request("GET", "/api/badge");
	if (!response.ok)
	{
		badgeStatus.value = response.error;
		return;
	}
	linked.value = response.data.linked;
	badgeStatus.value = linked.value ? "Badge lié à ce compte." : "Aucun badge lié.";
}

// Start badge pairing and show the live pairing status
async function startPairing()
{
	pairingSocket?.close();
	const start = await startBadgeAction("/api/badge/pairing", (message) =>
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
		pairingStatus.value = start.error;
		return;
	}
	pairingSocket = start.socket;
	pairingStatus.value = "Scanne ton badge dans les 10 secondes...";
}

// Unlink the currently linked badge from this account
async function unlink()
{
	const response = await request("DELETE", "/api/badge");
	if (!response.ok)
	{
		pairingStatus.value = response.error;
		return;
	}
	pairingStatus.value = "Badge délié.";
	refreshBadgeStatus();
}

onMounted(refreshBadgeStatus);
onUnmounted(() => pairingSocket?.close());
</script>

<template>
	<section class="content-panel">
		<h1>Paramètres</h1>
		<h2>Badge NFC</h2>
		<p class="form-message" role="status" aria-live="polite">{{ badgeStatus }}</p>
		<div class="actions">
			<button type="button" @click="startPairing">Lier mon badge</button>
			<button v-if="linked" type="button" class="secondary-button" @click="unlink">Délier mon badge</button>
		</div>
		<p v-if="pairingStatus" class="form-message" role="status" aria-live="polite">{{ pairingStatus }}</p>

		<TwoFactorSettings />
	</section>
</template>
