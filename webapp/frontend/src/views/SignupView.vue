<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import CasinoTable from "../components/CasinoTable.vue";
import { request } from "../api.js";

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const router = useRouter();

const username = ref("");
const email = ref("");
const password = ref("");
const error = ref("");

// Same rules as the backend: return the first problem in the form, or "" if it is valid
function formProblem()
{
	if (!USERNAME_PATTERN.test(username.value.trim()))
		return "Pseudo invalide : 3 à 20 caractères, lettres, chiffres, _ ou -";
	if (!EMAIL_PATTERN.test(email.value))
		return "Email invalide";
	if (password.value.length < 8)
		return "Le mot de passe doit faire au moins 8 caractères";
	if (password.value.length > 128)
		return "Le mot de passe doit faire au plus 128 caractères";
	return "";
}

// Validate the signup form, submit it, and go home on success (the API opens the session)
async function submit()
{
	error.value = formProblem();
	if (error.value)
		return;

	const body = { username: username.value.trim(), email: email.value.trim(), password: password.value };
	const response = await request("POST", "/api/auth/register", body);
	if (!response.ok)
	{
		error.value = response.error;
		return;
	}
	router.push("/home");
}
</script>

<template>
	<CasinoTable>
		<section class="bulb-frame">
			<div class="rounded-2xl border-2 border-[#ff2d95] box-neon bg-[#0d0616] p-6 sm:p-8">

				<h1 class="font-neon text-4xl sm:text-5xl text-center glow-pink flicker">NEW PLAYER</h1>
				<p class="text-center font-bungee glow-yellow mt-2 tracking-widest">♦ PRENDS TA PLACE À LA TABLE ♦</p>

				<form class="mt-8 space-y-4" novalidate @submit.prevent="submit">
					<div>
						<label for="username" class="block text-sm font-bungee glow-cyan mb-1">PSEUDO</label>
						<input id="username" v-model="username" name="username" type="text" autocomplete="username" minlength="3" maxlength="20" required class="input-neon">
						<p class="mt-1 text-xs text-gray-400">3 à 20 caractères : lettres, chiffres, _ ou -.</p>
					</div>
					<div>
						<label for="email" class="block text-sm font-bungee glow-cyan mb-1">EMAIL</label>
						<input id="email" v-model="email" name="email" type="email" autocomplete="email" required class="input-neon">
					</div>
					<div>
						<label for="password" class="block text-sm font-bungee glow-cyan mb-1">MOT DE PASSE</label>
						<input id="password" v-model="password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required class="input-neon">
						<p class="mt-1 text-xs text-gray-400">8 caractères minimum.</p>
					</div>

					<p class="text-center font-bold glow-red min-h-6" role="alert">{{ error }}</p>

					<button type="submit" class="btn-red w-full rounded-xl py-4 font-bungee text-lg sm:text-xl transition hover:scale-105">CRÉER MON COMPTE</button>
				</form>

				<p class="mt-6 text-center text-sm text-gray-300">Déjà high roller ? <RouterLink to="/login" class="glow-pink underline font-bold">Se connecter</RouterLink></p>
			</div>
		</section>
	</CasinoTable>
</template>
