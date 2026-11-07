import { createRouter, createWebHistory } from "vue-router";
import LoginView from "./views/LoginView.vue";
import SignupView from "./views/SignupView.vue";
import HomeView from "./views/HomeView.vue";
import SettingsView from "./views/SettingsView.vue";
import PrivacyView from "./views/PrivacyView.vue";
import TermsView from "./views/TermsView.vue";

// guest: only for logged-out users, auth: only for logged-in users
const routes = [
	{ path: "/", redirect: "/login" },
	{ path: "/login", component: LoginView, meta: { title: "Connexion", guest: true } },
	{ path: "/signup", component: SignupView, meta: { title: "Inscription", guest: true } },
	{ path: "/home", component: HomeView, meta: { title: "Accueil", auth: true } },
	{ path: "/settings", component: SettingsView, meta: { title: "Paramètres", auth: true } },
	{ path: "/privacy", component: PrivacyView, meta: { title: "Privacy Policy" } },
	{ path: "/terms", component: TermsView, meta: { title: "Terms of Service" } },
	{ path: "/:page(login|signup|home|settings|privacy|terms).html", redirect: (to) => "/" + to.params.page },
	{ path: "/:unknown(.*)", redirect: "/login" }
];

const router = createRouter({ history: createWebHistory(), routes });

// Ask the server whether the session cookie belongs to a logged-in user
async function isLoggedIn()
{
	try
	{
		const response = await fetch("/api/me");
		return response.ok;
	}
	catch
	{
		return false;
	}
}

// Redirect away from pages the user is not allowed to see
router.beforeEach(async (to) =>
{
	if (!to.meta.auth && !to.meta.guest)
		return true;
	const loggedIn = await isLoggedIn();
	if (to.meta.auth && !loggedIn)
		return "/login";
	if (to.meta.guest && loggedIn)
		return "/home";
	return true;
});

// Update the tab title after each navigation
router.afterEach((to) =>
{
	document.title = (to.meta.title ? to.meta.title + " — " : "") + "Jackpot";
});

export default router;
