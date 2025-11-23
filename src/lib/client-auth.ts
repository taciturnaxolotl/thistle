/**
 * Client-side password hashing using PBKDF2.
 * Uses aggressive iteration count to waste client CPU instead of server CPU.
 * Server will apply lightweight Argon2 on top for storage.
 */

const ITERATIONS = 1_000_000; // ~1-2 seconds on modern devices

/**
 * PBKDF2 implementation with fallback for non-secure contexts.
 */
async function pbkdf2(
	password: Uint8Array,
	salt: Uint8Array,
	iterations: number,
): Promise<Uint8Array> {
	if (crypto.subtle) {
		// Use native crypto.subtle when available (secure contexts)
		const keyMaterial = await crypto.subtle.importKey(
			"raw",
			password,
			{ name: "PBKDF2" },
			false,
			["deriveBits"],
		);

		const hashBuffer = await crypto.subtle.deriveBits(
			{
				name: "PBKDF2",
				salt,
				iterations,
				hash: "SHA-256",
			},
			keyMaterial,
			256,
		);

		return new Uint8Array(hashBuffer);
	}

	// Fallback: lazy-load pure JS implementation for non-secure contexts
	const { pbkdf2Fallback } = await import("./crypto-fallback");
	return pbkdf2Fallback(password, salt, iterations);
}

/**
 * Hash password client-side using PBKDF2.
 * @param password - Plaintext password
 * @param email - Email address (used as salt)
 * @returns Hex-encoded hash
 */
export async function hashPasswordClient(
	password: string,
	email: string,
): Promise<string> {
	const encoder = new TextEncoder();

	// Use email as salt (deterministic, unique per user)
	const passwordBytes = encoder.encode(password);
	const salt = encoder.encode(email.toLowerCase());

	// Derive 256 bits using PBKDF2 (with fallback for non-secure contexts)
	const hashBuffer = await pbkdf2(passwordBytes, salt, ITERATIONS);

	// Convert to hex string
	const hashArray = Array.from(hashBuffer);
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
