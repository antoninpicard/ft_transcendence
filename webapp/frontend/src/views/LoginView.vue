<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { request, startBadgeAction } from "../api.js";

const OAUTH_ERRORS = {
	oauth_state: "La connexion 42 a expiré, réessaie.",
	oauth_denied: "Tu as refusé la connexion sur l'intra 42.",
	oauth_email_taken: "L'email de ton compte 42 est déjà utilisé par un autre compte.",
	oauth_unavailable: "La connexion 42 est indisponible pour le moment."
};

const router = useRouter();
const route = useRoute();

const identifier = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);
const badgeStatus = ref("");
let badgeSocket = null;

// Same rules as the backend: return the first problem in the form, or "" if it is valid
function formProblem()
{
	const trimmed = identifier.value.trim();
	if (trimmed.length === 0)
		return "Entre ton email ou ton pseudo.";
	if (trimmed.length > 254)
		return "Email ou pseudo trop long.";
	if (password.value.length === 0)
		return "Entre ton mot de passe.";
	return "";
}

// Turn a /api/auth/login status code into a message for the user
function loginErrorMessage(status)
{
	if (status === 401)
		return "Identifiant ou mot de passe incorrect.";
	if (status === 429)
		return "Trop de tentatives, attends un peu.";
	return "Erreur serveur, réessaie plus tard.";
}

// Validate the form, log in with an email or a username, and go home on success
async function submitLogin()
{
	error.value = formProblem();
	if (error.value)
		return;

	loading.value = true;
	const body = { identifier: identifier.value.trim(), password: password.value };
	const response = await request("POST", "/api/auth/login", body);
	loading.value = false;
	if (!response.ok)
	{
		error.value = loginErrorMessage(response.status);
		return;
	}
	router.push("/home");
}

// Leave the site for the 42 intranet: the API redirects there, then back to /home
function loginWith42()
{
	window.location.href = "/api/auth/42";
}

// Start badge login and confirm it once the server sends a login token
async function startBadgeLogin()
{
	badgeSocket?.close();
	const start = await startBadgeAction("/api/badge/login", async (message) =>
	{
		if (message.status === "login-ready")
		{
			const confirm = await request("POST", "/api/badge/login/confirm", { token: message.token });
			if (confirm.ok)
				router.push("/home");
			else
				badgeStatus.value = "Erreur de connexion.";
		}
		else if (message.status === "unknown-badge")
			badgeStatus.value = "Ce badge n'est lié à aucun compte.";
	});

	if (!start.ok)
	{
		badgeStatus.value = start.error;
		return;
	}
	badgeSocket = start.socket;
	badgeStatus.value = "Scanne ton badge dans les 30 secondes...";
}

// Show why the 42 login failed when the API sent us back with ?oauth_error=...
function showOauthError()
{
	const message = OAUTH_ERRORS[route.query.oauth_error];
	if (message)
		error.value = message;
}

onMounted(showOauthError);
onUnmounted(() => badgeSocket?.close());
</script>

<template>
	<section class="auth-page">
		<h1>Connexion</h1>
		<form novalidate @submit.prevent="submitLogin">
			<label for="identifier">Email ou pseudo</label>
			<input id="identifier" v-model="identifier" name="identifier" type="text" autocomplete="username" maxlength="254" required>
			<label for="password">Mot de passe</label>
			<input id="password" v-model="password" name="password" type="password" autocomplete="current-password" maxlength="128" required>
			<button type="submit" :disabled="loading">{{ loading ? "Connexion…" : "Se connecter" }}</button>
			<p v-if="error" class="form-message error-message" role="alert">{{ error }}</p>
		</form>

		<p><RouterLink to="/signup">Pas de compte ? S'inscrire</RouterLink></p>

		<button type="button" @click="loginWith42">Se connecter avec 42</button>
		<button type="button" class="secondary-button" @click="startBadgeLogin">Se connecter avec mon badge</button>
		<p v-if="badgeStatus" class="form-message" role="status" aria-live="polite">{{ badgeStatus }}</p>
	</section>
</template>
