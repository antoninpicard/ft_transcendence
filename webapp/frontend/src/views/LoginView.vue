<script setup>
import { ref, computed, nextTick, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import CasinoTable from "../components/CasinoTable.vue";
import RouletteWheel from "../components/RouletteWheel.vue";
import { post, startBadgeAction } from "../api.js";
import { nudge, shake, celebrate, busted } from "../effects.js";

const HINT_EMAIL = "CHOISIS UNE COULEUR POUR TE CONNECTER";
const HINT_42 = "CHOISIS UNE COULEUR POUR TE CONNECTER AVEC 42";
const BETS = [
	{ color: "red", label: "ROUGE", class: "btn-red" },
	{ color: "black", label: "NOIR", class: "btn-black" }
];

const router = useRouter();

const email = ref("");
const password = ref("");
const formError = ref("");
const invalidFields = ref([]);
// "email" = the roulette logs in with the form, "42" = the roulette redirects to 42 OAuth
const loginMode = ref("email");
const hintArrows = ref(false);
const betsEnabled = ref(true);
const chosenColor = ref(null);
const wheelVisible = ref(false);
const result = ref({ title: "", class: "", subtitle: "" });
const badgeStatus = ref("");

const card = ref(null);
const hint = ref(null);
const errorEl = ref(null);
const betButtons = ref([]);
const roulette = ref(null);
let badgeSocket = null;

const hintText = computed(() =>
{
	const text = loginMode.value === "42" ? HINT_42 : HINT_EMAIL;
	return hintArrows.value ? "→ " + text + " ←" : text;
});

// Show an error under the fields and outline the faulty ones
async function showFormError(message, fields)
{
	formError.value = message;
	invalidFields.value = fields;
	await nextTick();
	nudge(errorEl.value);
}

// Hide the error and reset the fields' outline
function clearFormError()
{
	formError.value = "";
	invalidFields.value = [];
}

// Same rules as the backend: x@y.z email and a non-empty password
function validateForm()
{
	clearFormError();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value))
	{
		showFormError("Email invalide.", ["email"]);
		return false;
	}
	if (password.value.length === 0)
	{
		showFormError("Entre ton mot de passe.", ["password"]);
		return false;
	}
	return true;
}

// Switch between email login and 42 login
function setLoginMode(mode)
{
	loginMode.value = mode;
	hintArrows.value = false;
}

// Point the player to the red/black buttons
function askForColor()
{
	nudge(hint.value);
	betButtons.value.forEach(nudge);
}

// Lock or unlock the bet buttons and the fields; arrows mark the chosen color
function setBetsEnabled(enabled, color)
{
	betsEnabled.value = enabled;
	chosenColor.value = enabled ? null : color;
}

// Show the roulette result under the wheel
function showResult(title, titleClass, subtitle)
{
	result.value = { title, class: titleClass, subtitle };
}

// Turn a /api/login status code into a message for the player
function loginErrorMessage(status)
{
	if (status === 401)
		return "Email ou mot de passe incorrect.";
	if (status === 429)
		return "Trop de tentatives, attends un peu.";
	return "Le casino est fermé (erreur serveur). Réessaie plus tard.";
}

// Celebrate, then run the navigation once the animation had time to play
function winAndGo(go, subtitle)
{
	celebrate(...roulette.value.center());
	showResult("★ WINNER WINNER ★", "glow-yellow", subtitle);
	setTimeout(go, 1500);
}

// Full turn: validate, spin, then log in (email or 42) if the ball lands on the chosen color
async function play(color)
{
	if (loginMode.value === "email" && !validateForm())
	{
		nudge(hint.value);
		return;
	}

	setBetsEnabled(false, color);
	wheelVisible.value = true;
	showResult("RIEN NE VA PLUS…", "glow-cyan", "");
	await nextTick();

	const won = await roulette.value.spin(color);

	if (!won)
	{
		busted(...roulette.value.center(), card.value);
		showResult("PERDU ! RÉESSAYE.", "glow-pink", "Psst… le croupier t’a à la bonne. Le prochain tour est pour toi.");
		setBetsEnabled(true);
		return;
	}

	if (loginMode.value === "42")
	{
		winAndGo(() => window.location.href = "/api/auth/42", "Direction l’intra 42…");
		return;
	}

	showResult("GAGNÉ !", "glow-yellow", "Vérification de tes jetons…");
	const response = await post("/api/login", { email: email.value, password: password.value });

	if (response.ok)
	{
		winAndGo(() => router.push("/home"), "Connexion en cours…");
		return;
	}

	shake(card.value);
	showResult("GAGNÉ… MAIS REFUSÉ", "glow-pink", "");
	showFormError(loginErrorMessage(response.status), response.status === 401 ? ["email", "password"] : []);
	setBetsEnabled(true);
}

// Typing in the fields means email login again
function onInput()
{
	clearFormError();
	setLoginMode("email");
}

// Enter in the form doesn't submit: the player has to pick a color
function onEnter()
{
	setLoginMode("email");
	if (validateForm())
	{
		hintArrows.value = true;
		askForColor();
	}
}

// 42 login also goes through the roulette
function chooseLogin42()
{
	clearFormError();
	setLoginMode("42");
	askForColor();
}

// Start badge login and confirm it once the server sends a login token
async function startBadgeLogin()
{
	badgeSocket?.close();
	const start = await startBadgeAction("/api/badge-login/start", async (message) =>
	{
		if (message.status === "login-ready")
		{
			const confirm = await post("/api/badge-login/confirm", { token: message.token });
			if (confirm.ok)
				router.push("/home");
			else
				badgeStatus.value = "Erreur de connexion";
		}
		else if (message.status === "unknown-badge")
			badgeStatus.value = "Ce badge n'est lié à aucun compte.";
	});

	if (!start.ok)
	{
		badgeStatus.value = start.data.error;
		return;
	}
	badgeSocket = start.socket;
	badgeStatus.value = "Scanne ton badge dans les 30 secondes...";
}

onUnmounted(() => badgeSocket?.close());
</script>

<template>
	<CasinoTable>
		<section ref="card" class="bulb-frame">
			<div class="rounded-2xl border-2 border-[#ff2d95] box-neon bg-[#0d0616] p-6 sm:p-8">

				<h1 class="font-neon text-4xl sm:text-6xl text-center glow-pink flicker">JACKPOT</h1>
				<p class="text-center font-bungee glow-yellow mt-2 tracking-widest">♠ FAITES VOS JEUX ♠</p>

				<form class="mt-8 space-y-4" novalidate @submit.prevent @keydown.enter.prevent="onEnter">
					<div>
						<label for="email" class="block text-sm font-bungee glow-cyan mb-1">EMAIL</label>
						<input id="email" v-model="email" name="email" type="email" autocomplete="email" required class="input-neon"
							:class="{ 'input-error': invalidFields.includes('email') }" :aria-invalid="invalidFields.includes('email') || null"
							:disabled="!betsEnabled" @input="onInput">
					</div>
					<div>
						<label for="password" class="block text-sm font-bungee glow-cyan mb-1">MOT DE PASSE</label>
						<input id="password" v-model="password" name="password" type="password" autocomplete="current-password" required class="input-neon"
							:class="{ 'input-error': invalidFields.includes('password') }" :aria-invalid="invalidFields.includes('password') || null"
							:disabled="!betsEnabled" @input="onInput">
					</div>

					<p v-show="formError" ref="errorEl" class="text-center font-bold glow-red" role="alert">{{ formError }}</p>

					<p ref="hint" class="text-center font-bungee text-sm pt-3 glow-yellow">{{ hintText }}</p>
					<div class="flex gap-8 sm:gap-10 justify-center px-5 sm:px-6">
						<button v-for="bet in BETS" :key="bet.color" ref="betButtons" type="button" class="bet flex-1 rounded-xl py-4 font-bungee text-lg sm:text-xl"
							:class="[bet.class, { chosen: chosenColor === bet.color }]" :disabled="!betsEnabled" @click="play(bet.color)">{{ bet.label }}</button>
					</div>
				</form>

				<div v-show="wheelVisible" class="mt-8">
					<div class="flex flex-col items-center">
						<RouletteWheel ref="roulette" />
						<p class="mt-6 text-2xl font-bungee text-center min-h-16" role="status" aria-live="polite">
							<span :class="result.class">{{ result.title }}</span>
							<span class="block mt-1 text-base leading-snug text-gray-300 font-sans">{{ result.subtitle }}</span>
						</p>
					</div>
				</div>

				<div class="mt-8 grid grid-cols-2 gap-3">
					<button type="button" class="btn-neon py-2 text-sm font-bungee glow-yellow" @click="startBadgeLogin">BADGE</button>
					<button type="button" class="btn-neon py-2 text-sm font-bungee glow-yellow" @click="chooseLogin42">42 LOGIN</button>
				</div>
				<p class="mt-3 text-center text-sm glow-cyan" role="status" aria-live="polite">{{ badgeStatus }}</p>

				<p class="mt-6 text-center text-sm text-gray-300">Pas encore high roller ? <RouterLink to="/signup" class="glow-pink underline font-bold">S'inscrire</RouterLink></p>
			</div>
		</section>
	</CasinoTable>
</template>
