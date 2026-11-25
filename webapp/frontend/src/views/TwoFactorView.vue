<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { request } from "../api.js";

const CODE_PATTERN = /^[0-9]{6}$/;

const router = useRouter();

const code = ref("");
const error = ref("");
const loading = ref(false);

// Send the 6-digit code of the authenticator app to finish the login, then go home
async function submitCode()
{
	if (!CODE_PATTERN.test(code.value))
	{
		error.value = "Le code fait 6 chiffres.";
		return;
	}
	error.value = "";
	loading.value = true;
	const response = await request("POST", "/api/auth/2fa/verify", { code: code.value });
	loading.value = false;
	if (!response.ok)
	{
		error.value = response.error;
		code.value = "";
		return;
	}
	router.push("/home");
}
</script>

<template>
	<section class="auth-page">
		<h1>Code de sécurité</h1>
		<p>Ton compte est protégé par la double authentification. Entre le code à 6 chiffres affiché par ton application.</p>
		<form novalidate @submit.prevent="submitCode">
			<label for="code">Code</label>
			<input id="code" v-model="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
			<button type="submit" :disabled="loading">{{ loading ? "Vérification…" : "Valider" }}</button>
			<p v-if="error" class="form-message error-message" role="alert">{{ error }}</p>
		</form>
		<p><RouterLink to="/login">Recommencer la connexion</RouterLink></p>
	</section>
</template>
