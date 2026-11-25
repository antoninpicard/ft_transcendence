<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import CasinoTable from "../components/CasinoTable.vue";
import { post } from "../api.js";

const router = useRouter();

const email = ref("");
const password = ref("");
const error = ref("");

// Validate the signup form, submit it, and go to login on success
async function submit()
{
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value))
	{
		error.value = "Email invalide";
		return;
	}
	if (password.value.length < 8)
	{
		error.value = "Le mot de passe doit faire au moins 8 caractères";
		return;
	}

	const response = await post("/api/signup", { email: email.value, password: password.value });
	if (!response.ok)
	{
		error.value = response.data.error;
		return;
	}
	router.push("/login");
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
						<label for="email" class="block text-sm font-bungee glow-cyan mb-1">EMAIL</label>
						<input id="email" v-model="email" name="email" type="email" autocomplete="email" required class="input-neon">
					</div>
					<div>
						<label for="password" class="block text-sm font-bungee glow-cyan mb-1">MOT DE PASSE</label>
						<input id="password" v-model="password" name="password" type="password" autocomplete="new-password" minlength="8" required class="input-neon">
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
