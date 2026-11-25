<script setup>
import { ref, onMounted } from "vue";
import QRCode from "qrcode";
import { request } from "../api.js";

const CODE_PATTERN = /^[0-9]{6}$/;

const enabled = ref(false);
const status = ref("Chargement...");
const qrImage = ref("");
const secret = ref("");
const code = ref("");
const message = ref("");

// Fetch whether 2FA is on for this account and show it
async function refreshStatus()
{
	const response = await request("GET", "/api/auth/2fa");
	if (!response.ok)
	{
		status.value = response.error;
		return;
	}
	enabled.value = response.data.enabled;
	status.value = enabled.value ? "Double authentification activée." : "Double authentification désactivée.";
}

// Return an error message if the typed code is not 6 digits, or ""
function codeProblem()
{
	if (!CODE_PATTERN.test(code.value))
		return "Le code fait 6 chiffres.";
	return "";
}

// First activation step: ask the API for a new secret and draw its QR code
async function startSetup()
{
	message.value = "";
	const response = await request("POST", "/api/auth/2fa/setup");
	if (!response.ok)
	{
		message.value = response.error;
		return;
	}
	secret.value = response.data.secret;
	qrImage.value = await QRCode.toDataURL(response.data.otpauthUrl);
}

// Second activation step: send the first code of the app to prove the QR code was scanned
async function confirmEnable()
{
	message.value = codeProblem();
	if (message.value)
		return;
	const response = await request("POST", "/api/auth/2fa/enable", { code: code.value });
	code.value = "";
	if (!response.ok)
	{
		message.value = response.error;
		return;
	}
	qrImage.value = "";
	secret.value = "";
	message.value = "Double authentification activée !";
	refreshStatus();
}

// Turn 2FA off with a current code from the app
async function disable()
{
	message.value = codeProblem();
	if (message.value)
		return;
	const response = await request("POST", "/api/auth/2fa/disable", { code: code.value });
	code.value = "";
	if (!response.ok)
	{
		message.value = response.error;
		return;
	}
	message.value = "Double authentification désactivée.";
	refreshStatus();
}

onMounted(refreshStatus);
</script>

<template>
	<h2>Double authentification</h2>
	<p class="form-message" role="status" aria-live="polite">{{ status }}</p>

	<div v-if="!enabled && !qrImage" class="actions">
		<button type="button" @click="startSetup">Activer la double authentification</button>
	</div>

	<form v-if="!enabled && qrImage" class="two-factor-setup" novalidate @submit.prevent="confirmEnable">
		<p>Scanne ce QR code avec une application d'authentification (Google Authenticator, FreeOTP...), puis entre le code qu'elle affiche.</p>
		<img :src="qrImage" alt="QR code à scanner avec l'application d'authentification" width="200" height="200">
		<p>Ou saisis cette clé à la main : <code>{{ secret }}</code></p>
		<p class="form-message warning-message" role="note"><strong>Important :</strong> garde ce compte dans ton application tant que la double authentification est activée. Sans les codes de l'application, tu ne pourras plus te connecter ni la désactiver. Pour l'enlever, désactive-la d'abord ici, puis supprime-la de l'application.</p>
		<label for="enable-code">Code</label>
		<input id="enable-code" v-model="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
		<button type="submit">Confirmer l'activation</button>
	</form>

	<form v-if="enabled" class="two-factor-setup" novalidate @submit.prevent="disable">
		<p class="form-message warning-message" role="note">Désactive la double authentification ici avant de supprimer le compte de ton application : il faut un de ses codes.</p>
		<label for="disable-code">Code actuel de ton application</label>
		<input id="disable-code" v-model="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
		<button type="submit" class="secondary-button">Désactiver la double authentification</button>
	</form>

	<p v-if="message" class="form-message" role="status" aria-live="polite">{{ message }}</p>
</template>
