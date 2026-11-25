<template>
  <section class="auth-page">
    <h1>Connexion</h1>
    <form @submit.prevent="submitLogin">
      <label for="email">Email</label>
      <input id="email" v-model.trim="email" type="email" autocomplete="email" required />
      <label for="password">Mot de passe</label>
      <input id="password" v-model="password" type="password" autocomplete="current-password" required />
      <button type="submit" :disabled="loading">{{ loading ? 'Connexion…' : 'Se connecter' }}</button>
      <p v-if="error" class="form-message error-message">{{ error }}</p>
    </form>
    <p><RouterLink to="/signup">Pas de compte ? S'inscrire</RouterLink></p>
    <button type="button" class="secondary-button" :disabled="badgeLoading" @click="loginWithBadge">
      {{ badgeLoading ? 'En attente du badge…' : 'Se connecter avec mon badge' }}
    </button>
    <p v-if="badgeStatus" class="form-message">{{ badgeStatus }}</p>
  </section>
</template>

<script setup>
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { login } from '../services/auth';
import { confirmBadgeLogin, startBadgeAction } from '../services/badge';

const router = useRouter();
const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const badgeLoading = ref(false);
const badgeStatus = ref('');
let badgeSocket;

async function submitLogin() {
  error.value = '';
  loading.value = true;
  try {
    await login(email.value, password.value);
    await router.push('/');
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function loginWithBadge() {
  badgeStatus.value = '';
  badgeLoading.value = true;
  badgeSocket?.close();
  badgeSocket = startBadgeAction('/badge-login/start', async (message) => {
    if (message.status === 'login-ready') {
      try {
        await confirmBadgeLogin(message.token);
        await router.push('/');
      } catch (err) {
        badgeStatus.value = err.message;
        badgeLoading.value = false;
      }
    } else if (message.status === 'unknown-badge') {
      badgeStatus.value = "Ce badge n'est lié à aucun compte.";
      badgeLoading.value = false;
    }
  }, (message) => {
    badgeStatus.value = message;
    if (message !== 'Scanne ton badge dans les 30 secondes…') badgeLoading.value = false;
  });
}
</script>
