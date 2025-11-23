document.getElementById("start-btn")?.addEventListener("click", async () => {
	const authComponent = document.querySelector("auth-component");
	if (!authComponent) return;

	const isLoggedIn = await (
		authComponent as { isAuthenticated: () => Promise<boolean> }
	).isAuthenticated();

	if (isLoggedIn) {
		window.location.href = "/classes";
	} else {
		(authComponent as { openAuthModal: () => void }).openAuthModal();
	}
});
