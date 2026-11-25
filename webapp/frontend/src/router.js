import { ref } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import LoginView from "./views/LoginView.vue";
import TwoFactorView from "./views/TwoFactorView.vue";
import SignupView from "./views/SignupView.vue";
import HomeView from "./views/HomeView.vue";
import SettingsView from "./views/SettingsView.vue";
import PrivacyView from "./views/PrivacyView.vue";
import TermsView from "./views/TermsView.vue";

export const currentUser = ref(null);

const routes = [
	{ path: "/", redirect: "/login" },
	{ path: "/login", component: LoginView, meta: { title: "Connexion", guest: true } },
	{ path: "/login/2fa", component: TwoFactorView, meta: { title: "Code de sécurité", guest: true } },
	{ path: "/signup", component: SignupView, meta: { title: "Inscription", guest: true } },
	{ path: "/home", component: HomeView, meta: { title: "Accueil", auth: true } },
	{ path: "/settings", component: SettingsView, meta: { title: "Paramètres", auth: true } },
	{ path: "/privacy", component: PrivacyView, meta: { title: "Privacy Policy" } },
	{ path: "/terms", component: TermsView, meta: { title: "Terms of Service" } },
	{ path: "/:unknown(.*)", redirect: "/login" }
];

const router = createRouter({ history: createWebHistory(), routes });

// Ask the server who owns the session cookie: the account, or null if nobody is logged in (always a 200, so no error in the console)
async function fetchCurrentUser()
{
	try
	{
		const response = await fetch("/api/auth/session");
		if (!response.ok)
			return null;
		const data = await response.json();
		return data.user;
	}
	catch
	{
		return null;
	}
}

// Refresh the logged-in account, then keep guests out of "auth" pages and logged-in users out of "guest" pages
router.beforeEach(async (to) =>
{
	currentUser.value = await fetchCurrentUser();
	if (to.meta.auth && !currentUser.value)
		return "/login";
	if (to.meta.guest && currentUser.value)
		return "/home";
	return true;
});

// Update the tab title after each navigation
router.afterEach((to) =>
{
	document.title = to.meta.title + " — CLB Private Club";
});

export default router;
