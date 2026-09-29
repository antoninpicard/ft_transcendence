const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const formError = document.getElementById("form-error");
const betHint = document.getElementById("bet-hint");
const bets = document.querySelectorAll(".bet");
const wheelZone = document.getElementById("wheel-zone");
const result = document.getElementById("result");
const card = document.getElementById("card");

const HINT_EMAIL = "CHOISIS UNE COULEUR POUR TE CONNECTER";
const HINT_42 = "CHOISIS UNE COULEUR POUR TE CONNECTER AVEC 42";

// "email" = the roulette submits the form, "42" = the roulette redirects to 42 OAuth
let loginMode = "email";

// Show an error under the fields and outline the faulty ones
function showFormError(message, fields)
{
	formError.textContent = message;
	formError.classList.remove("hidden");
	fields.forEach((field) =>
	{
		field.classList.add("input-error");
		field.setAttribute("aria-invalid", "true");
	});
	nudge(formError);
}

// Hide the error and reset the fields' outline
function clearFormError()
{
	formError.classList.add("hidden");
	[emailInput, passwordInput].forEach((field) =>
	{
		field.classList.remove("input-error");
		field.removeAttribute("aria-invalid");
	});
}

// Same rules as the backend: x@y.z email and a non-empty password
function validateForm()
{
	clearFormError();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value))
	{
		showFormError("Email invalide.", [emailInput]);
		return false;
	}
	if (passwordInput.value.length === 0)
	{
		showFormError("Entre ton mot de passe.", [passwordInput]);
		return false;
	}
	return true;
}

// Switch between email login and 42 login, and update the hint
function setLoginMode(mode)
{
	loginMode = mode;
	betHint.textContent = mode === "42" ? HINT_42 : HINT_EMAIL;
}

// Point the player to the red/black buttons
function askForColor()
{
	nudge(betHint);
	bets.forEach(nudge);
}

// Lock or unlock the bet buttons and the fields; arrows mark the chosen color
function setBetsEnabled(enabled, chosen)
{
	bets.forEach((bet) =>
	{
		bet.disabled = !enabled;
		bet.classList.toggle("chosen", !enabled && bet === chosen);
	});
	emailInput.disabled = passwordInput.disabled = !enabled;
}

// Show the roulette result under the wheel
function showResult(title, titleClass, subtitle)
{
	result.innerHTML = '<span></span><span class="block mt-1 text-base leading-snug text-gray-300 font-sans"></span>';
	result.children[0].textContent = title;
	result.children[0].className = titleClass;
	result.children[1].textContent = subtitle;
}

// Turn a /api/login status code into a message for the player
function loginErrorMessage(status)
{
	if (status === 401)
		return "Email ou mot de passe incorrect.";
	if (status === 429)
		return "Trop de tentatives, attends un peu.";
	return "Le casino est fermé (erreur serveur). Réessaie plus tard.";
}

// Send the credentials, return the HTTP status (0 if the server is unreachable)
async function sendLogin()
{
	try
	{
		const response = await fetch("/api/login",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: emailInput.value, password: passwordInput.value })
		});
		return response.status;
	}
	catch
	{
		return 0;
	}
}

// Celebrate, then go to the given page once the animation had time to play
function winAndGo(url, subtitle)
{
	celebrate(...wheelCenter());
	showResult("★ WINNER WINNER ★", "glow-yellow", subtitle);
	setTimeout(() => window.location.href = url, 1500);
}

// Full turn: validate, spin, then log in (email or 42) if the ball lands on the chosen color
async function play(bet)
{
	if (loginMode === "email" && !validateForm())
	{
		nudge(betHint);
		return;
	}

	setBetsEnabled(false, bet);
	wheelZone.classList.remove("hidden");
	showResult("RIEN NE VA PLUS…", "glow-cyan", "");

	const won = await spinRoulette(bet.dataset.color);

	if (!won)
	{
		busted(...wheelCenter(), card);
		showResult("PERDU ! RÉESSAYE.", "glow-pink", "Psst… le croupier t’a à la bonne. Le prochain tour est pour toi.");
		setBetsEnabled(true);
		return;
	}

	if (loginMode === "42")
	{
		winAndGo("/api/auth/42", "Direction l’intra 42…");
		return;
	}

	showResult("GAGNÉ !", "glow-yellow", "Vérification de tes jetons…");
	const status = await sendLogin();

	if (status === 200)
	{
		winAndGo("/home.html", "Connexion en cours…");
		return;
	}

	shake(card);
	showResult("GAGNÉ… MAIS REFUSÉ", "glow-pink", "");
	showFormError(loginErrorMessage(status), status === 401 ? [emailInput, passwordInput] : []);
	setBetsEnabled(true);
}

bets.forEach((bet) => bet.addEventListener("click", () => play(bet)));

// Typing in the fields means email login again
[emailInput, passwordInput].forEach((field) => field.addEventListener("input", () =>
{
	clearFormError();
	setLoginMode("email");
}));

// Enter in the form doesn't submit: the player has to pick a color
loginForm.addEventListener("keydown", (event) =>
{
	if (event.key !== "Enter")
		return;
	event.preventDefault();
	setLoginMode("email");
	if (validateForm())
	{
		betHint.textContent = "→ " + HINT_EMAIL + " ←";
		askForColor();
	}
});

document.getElementById("login-42-button").addEventListener("click", () =>
{
	clearFormError();
	setLoginMode("42");
	askForColor();
});
