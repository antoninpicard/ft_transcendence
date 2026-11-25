<script setup>
import { useRouter } from "vue-router";
import { post } from "../api.js";

const router = useRouter();

// Log out and go back to the login page
async function logout()
{
	await post("/api/logout");
	router.replace("/login");
}
</script>

<template>
	<main class="relative z-10 flex-1 w-full max-w-lg mx-auto px-4 py-12">
		<section class="bulb-frame">
			<div class="rounded-2xl border-2 border-[#ff2d95] box-neon bg-[#0d0616] p-6 sm:p-8 text-center">
				<h1 class="font-neon text-4xl sm:text-5xl glow-pink flicker">WELCOME</h1>
				<p class="font-bungee glow-yellow mt-3 tracking-widest">★ TU ES CONNECTÉ, HIGH ROLLER ★</p>

				<div class="mt-8 flex flex-col gap-4">
					<RouterLink to="/settings" class="btn-neon block py-3 font-bungee glow-yellow">PARAMÈTRES</RouterLink>
					<button type="button" class="btn-red rounded-xl py-3 font-bungee transition hover:scale-105" @click="logout">SE DÉCONNECTER</button>
				</div>
			</div>
		</section>
	</main>
</template>
