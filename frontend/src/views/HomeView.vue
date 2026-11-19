<template>
  <section class="content-panel">
    <h1>Bienvenue au Scratch Club 🍪</h1>
    <p v-if="user">Connecté avec le compte <strong>{{ user.email }}</strong>.</p>
    <p>Retrouve ton espace, consulte tes paramètres et découvre les tickets de démonstration.</p>
    <div class="home-actions">
      <RouterLink class="action-link" to="/game">Entrer dans le jeu 🎟</RouterLink>
      <RouterLink class="action-link" to="/settings">Paramètres et badge NFC</RouterLink>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { getCurrentUser } from '../services/auth';

const user = ref(null);
onMounted(async () => {
  try { user.value = await getCurrentUser(); } catch { user.value = null; }
});
</script>
