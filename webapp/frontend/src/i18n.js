import { createI18n } from "vue-i18n";
import fr from "./locales/fr.json";
import en from "./locales/en.json";
import es from "./locales/es.json";

// Languages of the site; the first one is used when nothing else matches
export const LANGUAGES = ["fr", "en", "es"];
const STORAGE_KEY = "lang";

// Read the language saved by setLanguage, or null (storage can be blocked, e.g. private browsing)
function savedLanguage()
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

// Pick the starting language: the saved one, else the browser's ("en-US" -> "en"), else French
function startLanguage()
{
	const saved = savedLanguage();
	if (LANGUAGES.includes(saved))
		return saved;
	const browser = (navigator.language || "").slice(0, 2).toLowerCase();
	if (LANGUAGES.includes(browser))
		return browser;
	return LANGUAGES[0];
}

// Composition API mode (legacy: false); a missing key falls back to the French text
const i18n = createI18n({
	legacy: false,
	locale: startLanguage(),
	fallbackLocale: LANGUAGES[0],
	messages: { fr, en, es }
});

// Switch the whole site to a language, remember it, and tell the browser and screen readers (<html lang>)
export function setLanguage(lang)
{
	if (!LANGUAGES.includes(lang))
		return;
	i18n.global.locale.value = lang;
	document.documentElement.lang = lang;
	try
	{
		localStorage.setItem(STORAGE_KEY, lang);
	}
	catch
	{
		// Not saved: the choice still applies until the page is reloaded
	}
}

document.documentElement.lang = i18n.global.locale.value;

export default i18n;
