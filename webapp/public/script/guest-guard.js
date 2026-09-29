// Redirect to home if the user is already logged in
(async () =>
{
	const authCheck = await fetch("/api/me");
	if (authCheck.ok)
		window.location.replace("/home.html");
})();
