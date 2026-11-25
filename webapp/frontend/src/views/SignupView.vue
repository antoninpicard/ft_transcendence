<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { request } from "../api.js";

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const router = useRouter();

const username = ref("");
const email = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

// Same rules as the backend: return the first problem in the form, or "" if it is valid
function formProblem()
{
	if (!USERNAME_PATTERN.test(username.value.trim()))
		return "Pseudo invalide : 3 à 20 caractères, lettres, chiffres, _ ou -";
	if (!EMAIL_PATTERN.test(email.value.trim()))
		return "Email invalide.";
	if (password.value.length < 8)
		return "Le mot de passe doit faire au moins 8 caractères.";
	if (password.value.length > 128)
		return "Le mot de passe doit faire au plus 128 caractères.";
	return "";
}

// Validate the signup form, submit it, and go home on success (the API opens the session)
async function submitSignup()
{
	error.value = formProblem();
	if (error.value)
		return;

	loading.value = true;
	const body = { username: username.value.trim(), email: email.value.trim(), password: password.value };
	const response = await request("POST", "/api/auth/register", body);
	loading.value = false;
	if (!response.ok)
	{
		error.value = response.error;
		return;
	}
	router.push("/home");
}
</script>

<template>
	<section class="auth-page">
		<h1>Inscription</h1>
		<form novalidate @submit.prevent="submitSignup">
			<label for="username">Pseudo</label>
			<input id="username" v-model="username" name="username" type="text" autocomplete="username" minlength="3" maxlength="20" required>
			<label for="email">Email</label>
			<input id="email" v-model="email" name="email" type="email" autocomplete="email" required>
			<label for="password">Mot de passe (8 caractères minimum)</label>
			<input id="password" v-model="password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
			<button type="submit" :disabled="loading">{{ loading ? "Création…" : "Créer un compte" }}</button>
			<p v-if="error" class="form-message error-message" role="alert">{{ error }}</p>
		</form>
		<p><RouterLink to="/login">Déjà un compte ? Se connecter</RouterLink></p>
	</section>
</template>
