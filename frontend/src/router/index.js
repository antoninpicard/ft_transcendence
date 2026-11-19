import { createRouter, createWebHistory } from 'vue-router';
import { getCurrentUser } from '../services/auth';
import HomeView from '../views/HomeView.vue';
import LoginView from '../views/LoginView.vue';
import SignupView from '../views/SignupView.vue';
import SettingsView from '../views/SettingsView.vue';
import GameView from '../views/GameView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: LoginView, meta: { guestOnly: true } },
    { path: '/signup', name: 'signup', component: SignupView, meta: { guestOnly: true } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { requiresAuth: true } },
    { path: '/game', name: 'game', component: GameView, meta: { requiresAuth: true } }
  ]
});

router.beforeEach(async (to) => {
  let authenticated = false;
  try {
    await getCurrentUser();
    authenticated = true;
  } catch {
    authenticated = false;
  }

  if (to.meta.requiresAuth && !authenticated) return { name: 'login' };
  if (to.meta.guestOnly && authenticated) return { name: 'home' };
  return true;
});

export default router;
