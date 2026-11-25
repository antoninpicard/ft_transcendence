<script setup>
import { currentUser } from "../router.js";
</script>

<template>
	<section class="content-panel">
		<h1>Bienvenue au CLB Private Club 🍪</h1>
		<p v-if="currentUser">Connecté en tant que <strong>{{ currentUser.username }}</strong> ({{ currentUser.email }}).</p>
		<div class="actions">
			<RouterLink class="action-link" to="/game">Entrer dans le jeu 🎟</RouterLink>
			<RouterLink class="action-link" to="/settings">Paramètres et badge NFC</RouterLink>
		</div>
	</section>
</template>
