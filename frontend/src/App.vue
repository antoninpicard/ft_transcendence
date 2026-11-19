<template>
  <div class="app-shell">
    <header class="site-header">
      <RouterLink class="site-brand" to="/">CLB Private Club 🍪</RouterLink>
      <nav aria-label="Navigation principale">
        <RouterLink v-if="isAuthenticated" to="/">Accueil</RouterLink>
        <RouterLink v-if="isAuthenticated" to="/game">Jeux</RouterLink>
        <RouterLink v-if="isAuthenticated" to="/settings">Paramètres</RouterLink>
        <RouterLink v-if="!isAuthenticated" to="/login">Connexion</RouterLink>
        <button v-if="isAuthenticated" class="nav-logout" type="button" @click="logout">Déconnexion</button>
      </nav>
    </header>
    <main>
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { getCurrentUser, logout as logoutRequest } from './services/auth';

const router = useRouter();
const user = ref(null);
const isAuthenticated = computed(() => Boolean(user.value));

async function refreshUser() {
  try {
    user.value = await getCurrentUser();
  } catch {
    user.value = null;
  }
}

async function logout() {
  await logoutRequest();
  user.value = null;
  await router.push('/login');
}

onMounted(refreshUser);

router.afterEach(() => {
  refreshUser();
});
</script>

<style scoped>
.app-shell { width: min(1180px, 100%); margin: 0 auto; }
.site-header { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin: 0 auto 28px; padding: 14px 20px; border: 1px solid var(--line); border-radius: 15px; background: rgba(255,253,247,.92); }
.site-brand { color: var(--chocolate); font-size: 1.25rem; font-weight: 700; text-decoration: none; }
.site-header nav { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; }
.site-header nav a { color: var(--caramel); }
.nav-logout { min-height: 36px; margin: 0; padding: 6px 12px; }
@media (max-width: 620px) { .site-header { align-items: flex-start; flex-direction: column; } }
</style>
