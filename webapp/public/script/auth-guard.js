(async () =>
{
	const authCheck = await fetch("/api/me");
	if (!authCheck.ok)
		window.location.href = "/login.html";
})();
