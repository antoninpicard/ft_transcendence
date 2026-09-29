// Log out and redirect to the login page
document.getElementById("logout-button").addEventListener("click", async () =>
{
	await fetch("/api/logout", { method: "POST" });
	window.location.replace("/login.html");
});
