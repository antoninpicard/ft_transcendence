<script setup>
import { useRouter } from "vue-router";
import { currentUser } from "./router.js";
import { request } from "./api.js";

const router = useRouter();

// Log out, forget the account and go back to the login page
async function logout()
{
	await request("POST", "/api/auth/logout");
	currentUser.value = null;
	router.replace("/login");
}
</script>

<template>
	<div class="app-shell">
		<header class="site-header">
			<RouterLink class="site-brand" to="/">CLB Private Club 🍪</RouterLink>
			<nav aria-label="Navigation principale">
				<template v-if="currentUser">
					<RouterLink to="/home">Accueil</RouterLink>
					<RouterLink to="/game">Jeux</RouterLink>
					<RouterLink to="/settings">Paramètres</RouterLink>
					<button type="button" class="secondary-button" @click="logout">Déconnexion</button>
				</template>
				<template v-else>
					<RouterLink to="/login">Connexion</RouterLink>
					<RouterLink to="/signup">Inscription</RouterLink>
				</template>
			</nav>
		</header>

		<main>
			<RouterView />
		</main>

		<footer class="site-footer">
			<RouterLink to="/privacy">Privacy Policy</RouterLink>
			<RouterLink to="/terms">Terms of Service</RouterLink>
		</footer>
	</div>
</template>
