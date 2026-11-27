import { computed, ref, watch, watchEffect } from "vue";
import { currentUser } from "./session.js";
import { request } from "./api.js";

// The color themes. Their colors are in themes.css (one [data-theme="<id>"] block each);
// "pair" is the theme of the other brightness, used by the light/dark switch of the header.
export const THEMES = [
	{ id: "auto", name: "Automatique", description: "Biscuit ou Chocolat noir, selon le réglage clair/sombre de ton appareil" },
	{ id: "biscuit", name: "Biscuit", description: "Clair : crème, caramel et chocolat", dark: false, pair: "chocolat" },
	{ id: "chocolat", name: "Chocolat noir", description: "Sombre : chocolat noir et caramel", dark: true, pair: "biscuit" },
	{ id: "menthe", name: "Menthe", description: "Clair : vert menthe frais", dark: false, pair: "casino" },
	{ id: "casino", name: "Casino", description: "Sombre : tapis vert et or", dark: true, pair: "menthe" }
];

const DEFAULT_LIGHT = "biscuit";
const DEFAULT_DARK = "chocolat";
// Also read by the inline script of index.html, which applies the theme before the first paint
const STORAGE_KEY = "clb-theme";

const findTheme = (id) => THEMES.find((theme) => theme.id === id);

// The browser can refuse storage (private window, blocked site data): the theme then
// simply lasts until the page is closed
function readStored()
{
	try
	{
		return localStorage.getItem(STORAGE_KEY);
	}
	catch
	{
		return null;
	}
}

function store(id)
{
	try
	{
		localStorage.setItem(STORAGE_KEY, id);
	}
	catch
	{
		// Not saved in this browser; the account still keeps it
	}
}

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const systemDark = ref(darkQuery.matches);
darkQuery.addEventListener("change", (event) => { systemDark.value = event.matches; });

// What the user chose ("auto" included); an unknown id (an old or removed theme) is "auto"
export const themeChoice = ref(findTheme(readStored()) ? readStored() : "auto");

// The theme really displayed
export const activeTheme = computed(() =>
{
	if (themeChoice.value === "auto")
		return systemDark.value ? DEFAULT_DARK : DEFAULT_LIGHT;
	return themeChoice.value;
});

export const isDark = computed(() => findTheme(activeTheme.value).dark);

watchEffect(() =>
{
	const root = document.documentElement;
	root.dataset.theme = activeTheme.value;
	// Color of the browser UI on mobile: the background of the theme
	const background = getComputedStyle(root).getPropertyValue("--bg").trim();
	document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);
});

watch(themeChoice, store);

// Logged in, the account's theme wins: it follows the user on every device and on the kiosk
watch(() => currentUser.value?.theme, (theme) =>
{
	if (theme)
		themeChoice.value = findTheme(theme) ? theme : "auto";
});

// Apply a theme at once, and save it on the account when logged in.
// If the API refuses, the previous theme comes back and the error is returned.
export async function chooseTheme(id)
{
	const previous = themeChoice.value;
	themeChoice.value = id;
	if (!currentUser.value)
		return { ok: true };

	const response = await request("PATCH", "/api/users/" + currentUser.value.id, { theme: id });
	if (response.ok)
		currentUser.value = response.data;
	else
		themeChoice.value = previous;
	return response;
}

// Switch to the theme of the other brightness (Biscuit <-> Chocolat noir, Menthe <-> Casino)
export function toggleDark()
{
	return chooseTheme(findTheme(activeTheme.value).pair);
}
