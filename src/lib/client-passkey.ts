import {
	startAuthentication,
	startRegistration,
} from "@simplewebauthn/browser";
import type {
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/types";

/**
 * Register a new passkey for the current user
 */
export async function registerPasskey(
	name?: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		// Get registration options from server
		const optionsResponse = await fetch("/api/passkeys/register/options", {
			method: "POST",
		});

		if (!optionsResponse.ok) {
			const error = await optionsResponse.json();
			return {
				success: false,
				error: error.error || "Failed to get registration options",
			};
		}

		const options: PublicKeyCredentialCreationOptionsJSON =
			await optionsResponse.json();

		// Start browser passkey creation
		let credential: Awaited<ReturnType<typeof startRegistration>>;
		try {
			credential = await startRegistration({ optionsJSON: options });
		} catch (err) {
			// User cancelled or browser doesn't support passkeys
			return {
				success: false,
				error:
					err instanceof Error
						? err.message
						: "Passkey registration was cancelled",
			};
		}

		// Verify with server
		const verifyResponse = await fetch("/api/passkeys/register/verify", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				response: credential,
				challenge: options.challenge,
				name,
			}),
		});

		if (!verifyResponse.ok) {
			const error = await verifyResponse.json();
			return {
				success: false,
				error: error.error || "Failed to verify passkey",
			};
		}

		return { success: true };
	} catch (err) {
		return {
			success: false,
			error:
				err instanceof Error ? err.message : "Failed to register passkey",
		};
	}
}

/**
 * Authenticate with a passkey
 */
export async function authenticateWithPasskey(
	email?: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		// Get authentication options from server
		const optionsResponse = await fetch("/api/passkeys/authenticate/options", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email }),
		});

		if (!optionsResponse.ok) {
			const error = await optionsResponse.json();
			return {
				success: false,
				error: error.error || "Failed to get authentication options",
			};
		}

		const options: PublicKeyCredentialRequestOptionsJSON =
			await optionsResponse.json();

		// Start browser passkey authentication
		let credential: Awaited<ReturnType<typeof startAuthentication>>;
		try {
			credential = await startAuthentication({ optionsJSON: options });
		} catch (err) {
			// User cancelled or no passkey available
			return {
				success: false,
				error:
					err instanceof Error
						? err.message
						: "Passkey authentication was cancelled",
			};
		}

		// Verify with server
		const verifyResponse = await fetch("/api/passkeys/authenticate/verify", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				response: credential,
				challenge: options.challenge,
			}),
		});

		if (!verifyResponse.ok) {
			const error = await verifyResponse.json();
			return {
				success: false,
				error: error.error || "Failed to verify passkey",
			};
		}

		return { success: true };
	} catch (err) {
		return {
			success: false,
			error:
				err instanceof Error ? err.message : "Failed to authenticate with passkey",
		};
	}
}

/**
 * Check if passkeys are supported in this browser
 */
export function isPasskeySupported(): boolean {
	return (
		window.PublicKeyCredential !== undefined &&
		typeof window.PublicKeyCredential === "function"
	);
}
