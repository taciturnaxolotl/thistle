// Wait for component to be defined before setting token
await customElements.whenDefined("reset-password-form");

// Get token from URL and pass to component
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get("token");
const resetForm = document.getElementById("reset-form");
if (resetForm) {
	(resetForm as { token: string | null }).token = token;
}
