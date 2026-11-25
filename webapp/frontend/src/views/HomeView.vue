<script setup>
import { ref, onMounted } from "vue";
import { currentUser } from "../session.js";
import { request } from "../api.js";

const QUOTES = [
	{ text: "Démissionnez. Vendez votre maison. Grattez.", author: "anpicard" },
	{ text: "Ton badge ouvre la porte du club. Pas celle de la banque, heureusement.", author: "anpicard" },
	{ text: "99 % des joueurs abandonnent juste avant de gagner.", author: "tmarion" },
	{ text: "Le prochain ticket est le bon. Le suivant aussi.", author: "tmarion" },
	{ text: "Ton banquier ne comprendrait pas. Nous, si.", author: "fdeleard" },
	{ text: "Un ticket coûte moins cher qu'un psy. Dix, à peu près pareil.", author: "fdeleard" },
	{ text: "Le WAF bloque les injections SQL, pas tes mauvaises décisions.", author: "allefran" },
	{ text: "Tes secrets sont bien rangés dans Vault. Tes économies, moins.", author: "allefran" },
	{ text: "Ajoute des amis : ils pourront te prêter de l'argent.", author: "lucnavar" },
	{ text: "Erreur 402 : paiement requis. Continue de jouer.", author: "lucnavar" }
];

const quote = ref(QUOTES[0]);
const twoFactorOn = ref(null);
const badgeLinked = ref(null);

// Pick a random motivation quote, different from the one already shown
function newQuote()
{
	let next = quote.value;
	while (next === quote.value)
		next = QUOTES[Math.floor(Math.random() * QUOTES.length)];
	quote.value = next;
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

// On arrival: a first motivation quote and the security status of the account
function init()
{
	newQuote();
	loadSecurity();
}

onMounted(init);
</script>

<template>
	<section class="home">
		<p class="home-kicker" aria-hidden="true">♠ ♥ CLB PRIVATE CLUB ♦ ♣</p>
		<h1 class="home-title">Bienvenue, {{ currentUser?.username }} 🍪</h1>

		<RouterLink class="home-card home-card-play" to="/game">
			<span class="home-card-icon" aria-hidden="true">🎟</span>
			<div class="home-play-text">
				<h2>Tickets à gratter</h2>
				<p>Étoile Filante, Diamant Rouge ou Royale : tape la bonne séquence de touches et découvre ton gain.</p>
			</div>
			<span class="action-link home-play-button">Jouer maintenant</span>
		</RouterLink>

		<div class="home-row">
			<figure class="home-card home-quote">
				<p class="home-quote-label">Phrase de motivation</p>
				<blockquote>« {{ quote.text }} »</blockquote>
				<figcaption>— {{ quote.author }}</figcaption>
				<button type="button" class="secondary-button" @click="newQuote">🎲 Une autre</button>
			</figure>

			<RouterLink class="home-card" to="/settings">
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
