<script setup>
import { ref, onMounted } from "vue";
import { currentUser } from "../router.js";
import { request } from "../api.js";

const DEALER_LINES = [
	"La chance sourit aux audacieux… et aux gourmands.",
	"Ce soir, la maison offre les cookies. Pas les gains.",
	"Gratte doucement, le jackpot est timide.",
	"Ici, on mise des points, jamais de vrais euros.",
	"Le croupier a un bon pressentiment pour toi.",
	"Un ticket par jour éloigne la routine."
];

const dealerLine = ref("");
const twoFactorOn = ref(null);
const badgeLinked = ref(null);

// Pick a random sentence of the dealer, different from the one already shown
function newDealerLine()
{
	let line = dealerLine.value;
	while (line === dealerLine.value)
		line = DEALER_LINES[Math.floor(Math.random() * DEALER_LINES.length)];
	dealerLine.value = line;
}

// Ask the API whether the account has 2FA on and a badge linked, for the security card
async function loadSecurity()
{
	const twoFactor = await request("GET", "/api/auth/2fa");
	if (twoFactor.ok)
		twoFactorOn.value = twoFactor.data.enabled;
	const badge = await request("GET", "/api/badge");
	if (badge.ok)
		badgeLinked.value = badge.data.linked;
}

// Text of a security status: "…" while loading, then the "on" or "off" text
function statusText(value, onText, offText)
{
	if (value === null)
		return "…";
	if (value)
		return onText;
	return offText;
}

// CSS class of a security status: green when it is on
function statusClass(value)
{
	if (value)
		return "status-on";
	return "status-off";
}

// On arrival: a first sentence of the dealer and the security status of the account
function init()
{
	newDealerLine();
	loadSecurity();
}

onMounted(init);
</script>

<template>
	<section class="home">
		<div class="content-panel home-hero">
			<p class="home-kicker" aria-hidden="true">♠ ♥ CLB PRIVATE CLUB ♦ ♣</p>
			<h1>Bienvenue, {{ currentUser?.username }} 🍪</h1>
			<blockquote class="dealer-line">
				<p>« {{ dealerLine }} »</p>
				<footer>— le croupier</footer>
			</blockquote>
			<button type="button" class="secondary-button dealer-button" @click="newDealerLine">🎲 Une autre réplique</button>
		</div>

		<div class="home-cards">
			<RouterLink class="home-card home-card-play" to="/game">
				<span class="home-card-icon" aria-hidden="true">🎟</span>
				<h2>Tickets à gratter</h2>
				<p>Étoile Filante, Diamant Rouge ou Royale : tape la bonne séquence de touches et découvre ton gain.</p>
				<span class="action-link">Jouer</span>
			</RouterLink>

			<RouterLink class="home-card" to="/settings">
				<span class="home-card-icon" aria-hidden="true">🛡️</span>
				<h2>Ta sécurité</h2>
				<ul class="status-list">
					<li :class="statusClass(twoFactorOn)">Double authentification : {{ statusText(twoFactorOn, "activée", "désactivée") }}</li>
					<li :class="statusClass(badgeLinked)">Badge NFC : {{ statusText(badgeLinked, "lié", "non lié") }}</li>
				</ul>
				<span class="action-link">Gérer</span>
			</RouterLink>
		</div>
	</section>
</template>
