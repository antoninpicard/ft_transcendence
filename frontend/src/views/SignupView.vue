<template>
  <section class="auth-page">
    <h1>Inscription</h1>
    <form @submit.prevent="submitSignup">
      <label for="email">Email</label>
      <input id="email" v-model.trim="email" type="email" autocomplete="email" required />
      <label for="password">Mot de passe</label>
      <input id="password" v-model="password" type="password" autocomplete="new-password" minlength="8" required />
      <button type="submit" :disabled="loading">{{ loading ? 'Création…' : 'Créer un compte' }}</button>
      <p v-if="error" class="form-message error-message">{{ error }}</p>
    </form>
    <p><RouterLink to="/login">Déjà un compte ? Se connecter</RouterLink></p>
  </section>
</template>

<script setup>
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { signup } from '../services/auth';

const router = useRouter();
const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function submitSignup() {
  error.value = '';
  loading.value = true;
  try {
    await signup(email.value, password.value);
    await router.push('/login');
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}
</script>
